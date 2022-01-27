/* eslint-disable one-var */
/* eslint-disable no-underscore-dangle */


/* eslint-disable newline-per-chained-call */
const fs = require('fs'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      { Driver } = require('@medable/mdctl-api-driver'),
      { Org } = require('@medable/mdctl-api-driver/lib/cortex.object'),
      path = require('path'),
      packageFileDir = path.join(__dirname, '../packageScripts')
const MenuConfigMapping = require('./mappings/MenuConfigMapping')

class StudyManifestTools {

  constructor(client, options = {}) {
    Object.assign(privatesAccessor(this), {
      client,
      options
    })
  }

  async getTasks() {
    const { client } = privatesAccessor(this),
          driver = new Driver(client),
          org = new Org(driver)

    return org.objects.c_tasks.find().limit(false).paths('c_name').toArray()
  }

  async getConsentTemplates() {
    const { client } = privatesAccessor(this),
          driver = new Driver(client),
          org = new Org(driver)

    return org.objects.ec__document_templates.find().limit(false).paths('ec__title').toArray()
  }

  async getOrgObjectInfo(org) {

    const { objects } = org.objects,
          allObj = await objects.find()
            .limit(false)
            .toArray(),
          orgReferenceProps = allObj
            .reduce((acc, obj) => {

              const references = this.getReferences(obj)

              if (!acc[obj.pluralName]) {
                acc[obj.pluralName] = []
              }

              acc[obj.pluralName].push(...references)

              return acc

            }, {})

    Object.assign(privatesAccessor(this), {
      orgObjects: allObj.map(({ name, pluralName, uniqueKey }) => ({ name, pluralName, uniqueKey }))
    })

    return { orgReferenceProps }
  }

  /**
   * Recursively analyzes an object and returns the references found
   * @param {*} object schema
   * @returns an array of references found in the schema
   */
  getReferences(object) {
    const res = []

    object.properties.forEach((prop) => {

      const isReference = prop.type === 'Reference',
            isObjectIdWithSourceObj = (prop.type === 'ObjectId' && prop.sourceObject),
            isDocument = prop.type === 'Document',
            hasValidators = !!(prop.validators && prop.validators.length),
            reference = {
              name: prop.name,
              array: !!prop.array,
              ...(prop.sourceObject && { object: prop.sourceObject }),
              type: prop.type
            }

      if (isReference || isObjectIdWithSourceObj) {

        const isRequired = hasValidators && !!(prop.validators.find(({ name }) => name === 'required'))
        reference.required = isRequired

        res.push(reference)

      } else if (isDocument) {

        // Documents are just wrappers
        // so they are always not required even if the  document is required
        // we care if the references INSIDE the document are required
        reference.required = false

        const documentReferences = this.getReferences(prop)

        if (documentReferences.length) {
          reference.documents = documentReferences
          res.push(reference)
        }

      }

    })

    return res
  }

  mapObjectNameToPlural(name) {
    return privatesAccessor(this).orgObjects.find(v => v.name === name).pluralName
  }

  mapObjectPluralToName(pluralName) {
    return privatesAccessor(this).orgObjects.find(v => v.pluralName === pluralName).name
  }

  async getStudyManifest() {
    console.log('Building Manifest')
    const { client } = privatesAccessor(this),
          driver = new Driver(client),
          org = new Org(driver),
          // eslint-disable-next-line camelcase
          { c_study } = org.objects,
          study = await c_study.readOne()
            .execute(),
          { orgReferenceProps } = await this.getOrgObjectInfo(org),
          allEntities = [study, ...await this.getStudyManifestEntities(org, study, orgReferenceProps)],
          { outputEntities, removedEntities } = this.validateReferences(allEntities, orgReferenceProps),
          manifest = this.createManifest(outputEntities),
          menuConfigMapping = new MenuConfigMapping(org),
          mappings = await menuConfigMapping.getMappings(),
          hasMappings = !!mappings.length

    if (hasMappings) {
      this.writePostImportScript(mappings)
    }

    this.writeIssues(removedEntities)
    this.writePackage('study')

    return { manifest, removedEntities }
  }

  async writePostImportScript(mappings) {
    const { options } = privatesAccessor(this),
          outputDir = options.dir || process.cwd()

    console.log('Writing post import script')

    fs.writeFileSync(`${outputDir}/install.after.js`, `
const { run } = require('expressions')

const mappings = ${JSON.stringify(mappings)}

mappings.forEach(({ path, mapTo }) => {
  const [entity, entityKey, property, ...rest] = path.split('.'),
      isDocPropUpdate = !!rest.length,
      value = run(mapTo)

if (isDocPropUpdate) {
  const [entityResult] = org.objects[entity]
    .find({ c_key: entityKey })
    .paths(property)
    .limit(1)
    .toArray()

  if (!entityResult) return

  const documentProps = entityResult[property]

  if (!documentProps || documentProps.length === 0) return

  const [docPropKey, docProp] = rest

  if (!docPropKey || !docProp) return

  const propToUpdate = documentProps.find(({ c_key }) => c_key === docPropKey),

        idToUpdate = propToUpdate._id

  return org.objects[entity]
    .updateOne({ c_key: entityKey })
    .pathUpdate(property + '/' + idToUpdate + '/' + docProp , value)

}

return org.objects[entity]
  .updateOne({ c_key: entityKey }, { $set: { [property]: value } })
  .execute()
})
    `)
  }

  async getTasksManifest(taskIds) {
    console.log('Building Manifest')
    const { client } = privatesAccessor(this),
          driver = new Driver(client),
          org = new Org(driver),
          { orgReferenceProps } = await this.getOrgObjectInfo(org),
          allEntities = await this.getTaskManifestEntities(org, taskIds, orgReferenceProps),
          { outputEntities, removedEntities } = this.validateReferences(allEntities, orgReferenceProps, ['c_tasks']),
          manifest = this.createManifest(outputEntities)

    this.writeIssues(removedEntities)
    this.writePackage('task')

    return { manifest, removedEntities }

  }

  async getConsentsManifest(consentIds) {
    console.log('Building Manifest')
    const { client } = privatesAccessor(this),
          driver = new Driver(client),
          org = new Org(driver),
          { orgReferenceProps } = await this.getOrgObjectInfo(org),
          allEntities = await this.getConsentManifestEntities(org, consentIds, orgReferenceProps),
          { outputEntities, removedEntities } = this.validateReferences(allEntities, orgReferenceProps, ['ec__document_templates']),
          manifest = this.createManifest(outputEntities)

    this.writeIssues(removedEntities)
    this.writePackage('consent')

    return { manifest, removedEntities }

  }

  createManifest(entities) {
    const manifest = {
            object: 'manifest',
            dependencies: false,
            exportOwner: false,
            importOwner: false
          },
          { orgObjects } = privatesAccessor(this)

    entities.forEach((entity) => {
      const { uniqueKey } = orgObjects.find(v => v.name === entity.object)
      if (!manifest[entity.object]) {
        manifest[entity.object] = {
          includes: []
        }
      }
      manifest[entity.object].includes.push(entity[uniqueKey])

    })

    if (manifest.c_study) {
      manifest.c_study.defer = [
        'c_public_group',
        'c_default_subject_site',
        'c_default_subject_visit_schedule',
        'c_default_subject_group',
        'c_default_participant_schedule',
        'c_menu_config.c_group_id'
      ]
    }

    return manifest

  }

  validateReferences(entities, orgReferenceProps, ignore = []) {

    console.log('Validating Internal References')
    const outputEntities = [],
          removedEntities = []

    entities.forEach((entity) => {

      const pluralName = this.mapObjectNameToPlural(entity.object),
            references = ignore.includes(pluralName) ? [] : orgReferenceProps[pluralName],
            refEntityIds = this.getIdsByReferenceType(entity, references),
            issues = this.getEntityIssues(entity, refEntityIds, entities),
            isValid = issues.length === 0

      if (isValid) {
        outputEntities.push(entity)
      } else {
        removedEntities.push({ entity, issues })
      }
    })

    if (removedEntities.length) {
      console.log('\x1b[1m\x1b[31m\x1b[40m%s\x1b[0m', 'Referential Integrity Errors Found')
      console.log('\x1b[1m\x1b[31m\x1b[40m%s\x1b[0m', 'Please check issuesReport.json for more details')
    }

    return { outputEntities, removedEntities }
  }

  getIdsByReferenceType(entity, references) {
    const refEntityIds = []

    references.forEach((ref) => {

      const wrapper = {
        reference: ref.name, referenceIds: [], required: ref.required
      }

      if (ref.type === 'Reference') {

        const reference = entity[ref.name]

        if (reference) {
          wrapper.referenceIds
            .push({ _id: reference._id, reference: ref.name, required: ref.required })
        }

        refEntityIds.push(wrapper)

      } else if (ref.type === 'ObjectId' && ref.array) {
        const objectIdArr = entity[ref.name]

        if (objectIdArr && objectIdArr.length) {
          const referenceIds = objectIdArr
            .map(objectId => ({ _id: objectId, reference: ref.name, required: ref.required }))

          wrapper.referenceIds.push(...referenceIds)
        }

        refEntityIds.push(wrapper)

      } else if (ref.type === 'ObjectId') {
        const objectId = entity[ref.name]

        if (objectId) {
          wrapper.referenceIds
            .push({ _id: objectId, reference: ref.name, required: ref.required })
        }

        refEntityIds.push(wrapper)

      } else if (ref.type === 'Document' && ref.array) { // Document Array Case

        const documents = entity[ref.name]

        if (documents && documents.length) {
          const referenceIds = documents
            .map(document => this.getIdsByReferenceType(document, ref.documents))
          // flatten
            .reduce(
              (flatAcc, [{ referenceIds: referenceIdArr }]) => flatAcc.concat(referenceIdArr), []
            )

          wrapper.referenceIds.push(...referenceIds)

        }

        refEntityIds.push(wrapper)

      } else if (ref.type === 'Document') {
        const document = entity[ref.name]

        if (document) {
          const referenceIdsWrapper = this.getIdsByReferenceType(document, ref.documents),
                referenceIds = referenceIdsWrapper
                // flatten
                  .reduce(
                    (flatAcc, { referenceIds: referenceIdArr }) => flatAcc.concat(referenceIdArr), []
                  )

          wrapper.referenceIds.push(...referenceIds)

        }

        refEntityIds.push(wrapper)

      }

    })

    return refEntityIds
  }

  getEntityIssues(entity, refEntityIds, entities) {
    const issues = []

    refEntityIds.forEach(({ reference, referenceIds, required }) => {

      const hasReferences = referenceIds.length > 0,
            hasNoReferenceAndRequired = required && referenceIds.length === 0

      if (hasReferences) {

        referenceIds.forEach(({ _id: refEntityId, reference: subReference }) => {
          const refEntity = entities.find(v => v._id === refEntityId)

          if (!refEntity) {
            const issue = `Entity not found in export for ${entity.object} ${entity._id} for reference ${subReference} id ${refEntityId}`
            issues.push(issue)
          }
        })
      } else if (hasNoReferenceAndRequired) {
        const issue = `No entity id for ${entity.object} ${entity._id} for reference ${reference}`
        issues.push(issue)
      }
    })

    return issues
  }

  async getExportObjects(org, object, where, orgReferenceProps) {

    // is it available in the org? if not return an empty array
    if (!privatesAccessor(this).orgObjects.find(v => v.pluralName === object)) return []

    const { orgObjects } = privatesAccessor(this),
          { uniqueKey } = orgObjects.find(v => v.pluralName === object),
          refProps = this.getReferenceProps(orgReferenceProps[object]),
          paths = [uniqueKey, ...refProps],
          cursor = org.objects[object].find(where)
            .paths(paths)
            .limit(false)

    console.log(`Getting ${object}`)
    // eslint-disable-next-line one-var
    const data = await cursor.toArray()

    if (data.length && data[0].object === 'fault') {
      throw data[0]
    }

    return data
  }

  getReferenceProps(referencedProps = []) {
    return referencedProps
      .map((referenceProp) => {
        const isDocument = referenceProp.type === 'Document'

        if (isDocument) {
          return referenceProp
            .documents
            .map(subReferenceProp => `${referenceProp.name}.${subReferenceProp.name}`)
        }

        return [referenceProp.name]
      })
      .reduce((acc, curr) => acc.concat(curr), [])
  }

  async getStudyManifestEntities(org, study, orgReferenceProps) {

    const tasks = await this.getExportObjects(org, 'c_tasks', { c_study: study._id }, orgReferenceProps),
          steps = await this.getExportObjects(org, 'c_steps', { c_task: { $in: tasks.map(v => v._id) } }, orgReferenceProps),
          branches = await this.getExportObjects(org, 'c_branches', { c_task: { $in: tasks.map(v => v._id) } }, orgReferenceProps),
          visitSchedules = await this.getExportObjects(org, 'c_visit_schedules', { c_study: study._id }, orgReferenceProps),
          visits = await this.getExportObjects(org, 'c_visits', { c_visit_schedules: { $in: visitSchedules.map(v => v._id) } }, orgReferenceProps),
          groups = await this.getExportObjects(org, 'c_groups', { c_study: study._id }, orgReferenceProps),
          groupTasks = await this.getExportObjects(org, 'c_group_tasks', { c_group: { $in: groups.map(v => v._id) } }, orgReferenceProps),
          faults = await this.getExportObjects(org, 'c_faults', null, orgReferenceProps),
          reports = await this.getExportObjects(org, 'c_dmweb_reports', null, orgReferenceProps),
          sites = await this.getExportObjects(org, 'c_sites', { c_study: study._id }, orgReferenceProps),
          anchorDateTemplates = await this.getExportObjects(org, 'c_anchor_date_templates', { c_study: study._id }, orgReferenceProps),

          taskAssignments = await this.getExportObjects(org, 'c_task_assignments', null, orgReferenceProps),
          participantSchedules = await this.getExportObjects(org, 'c_participant_schedules', null, orgReferenceProps),
          patientFlags = await this.getExportObjects(org, 'c_patient_flags', null, orgReferenceProps),

          documentTemplates = await this.getExportObjects(org, 'ec__document_templates', { ec__study: study._id }, orgReferenceProps),
          knowledgeChecks = await this.getExportObjects(org, 'ec__knowledge_checks', { ec__document_template: { $in: documentTemplates.map(v => v._id) } }, orgReferenceProps),
          defaultDoc = await this.getExportObjects(org, 'ec__default_document_csses', null, orgReferenceProps),

          // looker
          lookerIntegrationRecords = await this.getExportObjects(org, 'c_looker_integration_records', null, orgReferenceProps),

          // integrations
          vendorIntegrationRecords = await this.getExportObjects(org, 'int__vendor_integration_records', null, orgReferenceProps),
          integrationMappings = await this.getExportObjects(org, 'int__model_mappings', null, orgReferenceProps),
          integrationPipelines = await this.getExportObjects(org, 'int__pipelines', null, orgReferenceProps),

          // oracle
          oracleStudies = await this.getExportObjects(org, 'orac__studies', null, orgReferenceProps),
          oracleSites = await this.getExportObjects(org, 'orac__sites', null, orgReferenceProps),
          oracleForms = await this.getExportObjects(org, 'orac__forms', null, orgReferenceProps),
          oracleQuestions = await this.getExportObjects(org, 'orac__form_questions', null, orgReferenceProps),
          oracleEvents = await this.getExportObjects(org, 'orac__events', null, orgReferenceProps)


    return [
      ...tasks, ...steps, ...branches,
      ...visitSchedules, ...visits, ...groups, ...faults, ...reports, ...sites,
      ...groupTasks, ...taskAssignments, ...participantSchedules, ...anchorDateTemplates,
      ...patientFlags, ...documentTemplates, ...knowledgeChecks, ...defaultDoc,
      ...lookerIntegrationRecords,
      ...vendorIntegrationRecords, ...integrationMappings, ...integrationPipelines,
      ...oracleStudies, ...oracleSites,
      ...oracleForms, ...oracleQuestions, ...oracleEvents
    ]
  }

  async getTaskManifestEntities(org, taskIds, orgReferenceProps) {

    const tasks = await this.getExportObjects(org, 'c_tasks', { _id: { $in: taskIds } }, orgReferenceProps),
          steps = await this.getExportObjects(org, 'c_steps', { c_task: { $in: tasks.map(v => v._id) } }, orgReferenceProps),
          branches = await this.getExportObjects(org, 'c_branches', { c_task: { $in: tasks.map(v => v._id) } }, orgReferenceProps)

    return [...tasks, ...steps, ...branches]
  }

  async getConsentManifestEntities(org, consentId, orgReferenceProps) {

    const documentTemplates = await this.getExportObjects(org, 'ec__document_templates', { _id: { $in: consentId } }, orgReferenceProps),
          knowledgeChecks = await this.getExportObjects(org, 'ec__knowledge_checks', { ec__document_template: { $in: documentTemplates.map(v => v._id) } }, orgReferenceProps),
          defaultCSS = await this.getExportObjects(org, 'ec__default_document_csses', null, orgReferenceProps)

    return [...documentTemplates, ...knowledgeChecks, ...defaultCSS]
  }

  writeIssues(removedEntities) {
    const { options } = privatesAccessor(this),
          outputDir = options.dir || process.cwd(),

          issues = removedEntities.reduce((a, v) => {
            a.push(...v.issues)
            return a
          }, [])

    // write the issues files
    if (issues.length) {
      fs.writeFileSync(`${outputDir}/issuesReport.json`, JSON.stringify(issues, null, 2))
      fs.writeFileSync(`${outputDir}/detailedIssuesReport.json`, JSON.stringify(removedEntities, null, 2))
    }


  }

  writePackage(entity) {
    const packageFile = JSON.parse(fs.readFileSync(path.join(packageFileDir, 'package.json'), 'UTF8')),
          { options } = privatesAccessor(this),
          outputDir = options.dir || process.cwd(),
          ingestScript = 'ingestTransform.js'


    // eslint-disable-next-line default-case
    switch (entity) {
      case 'study': {
        packageFile.name = 'Study export'
        packageFile.description = 'An export of a study'
        break
      }
      case 'task': {
        packageFile.name = 'Task export'
        packageFile.description = 'An export of task or multiple tasks'
        break
      }
      case 'consent': {
        packageFile.name = 'Consent export'
        packageFile.description = 'An export of task or multiple consent templates'
        break
      }
    }

    packageFile.pipes.ingest = ingestScript

    packageFile.scripts = { afterImport: 'install.after.js' }

    fs.copyFileSync(path.join(packageFileDir, ingestScript), path.join(outputDir, ingestScript))

    fs.writeFileSync(`${outputDir}/package.json`, JSON.stringify(packageFile, null, 2))
  }

}

module.exports = StudyManifestTools
