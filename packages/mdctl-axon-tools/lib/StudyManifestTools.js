/* eslint-disable max-len */
/* eslint-disable one-var */
/* eslint-disable no-underscore-dangle */


/* eslint-disable newline-per-chained-call */
const fs = require('fs'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      { Driver } = require('@medable/mdctl-api-driver'),
      { Org } = require('@medable/mdctl-api-driver/lib/cortex.object'),
      path = require('path'),
      packageFileDir = path.join(__dirname, '../packageScripts'),
      { Fault } = require('@medable/mdctl-core'),
      {
        first, intersection, isObject, isArray, get: getProperty, uniq, difference
      } = require('lodash'),
      { getMappingScript, getEcMappingScript } = require('./mappings')

class StudyManifestTools {

  constructor(client, options = {}) {
    Object.assign(privatesAccessor(this), {
      client,
      options
    })
  }

  async isWorkflowSupported() {
    const {org} = await this.getOrgAndReferences()
    const client = org.driver.client
    const workflowVersion = await client.get('/config/workflow__version')
    return !!getProperty(workflowVersion, 'version')
  }

  getAvailableObjectNames() {
    return ['c_study', 'c_task', 'c_visit_schedule', 'ec__document_template', 'c_group', 'c_query_rule',
      'c_anchor_date_template', 'c_fault', 'c_dmweb_report', 'c_site', 'c_task_assignment', 'c_participant_schedule',
      'c_patient_flag', 'c_looker_integration_record', 'int__vendor_integration_record', 'int__model_mapping',
      'int__pipeline', 'orac__studies', 'orac__sites', 'orac__forms', 'orac__form_questions', 'orac__events', 'wf__workflow']
  }

  validateAndCleanManifest(manifestJSON) {
    if (!manifestJSON.object || manifestJSON.object !== 'manifest') {
      throw Fault.create('kInvalidArgument', { reason: 'The argument is not a valid manifest' })
    }
    return Object.keys(manifestJSON)
      .filter(key => this.getAvailableObjectNames().includes(key))
      .reduce((curr, key) => Object.assign(curr, { [key]: manifestJSON[key] }), {})
  }

  getOrg() {
    const { client } = privatesAccessor(this),
          driver = new Driver(client),
          org = new Org(driver)

    return org
  }

  async getTasks() {
    const org = this.getOrg(),
          study = first(await org.objects.c_study.find().paths('_id').toArray())

    return study ? org.objects.c_tasks.find({ c_study: study._id }).limit(false).paths('c_name').toArray() : []
  }
  async getWorkflows() {
    const org = this.getOrg()
    return org.objects.wf__workflow.find().limit(false).paths('wf__meta.wf__name').toArray()
  }

  getDtConfigs() {
    const org = this.getOrg()
    return org.objects.dt__config.find().limit(false).paths('dt__name').toArray()
  }

  async getConsentTemplates() {
    const org = this.getOrg(),
          study = first(await org.objects.c_study.find().paths('_id').toArray())

    return study ? org.objects.ec__document_templates.find({ ec__study: study._id }).limit(false).paths('ec__title', 'ec__identifier').toArray() : []
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

  async getStudyManifest(manifestObject, excludeTemplates = false) {
    console.log('Building Manifest')
    const manifestAndDeps = await this.buildManifestAndDependencies(manifestObject, excludeTemplates)
    await this.writeStudyToDisk(manifestAndDeps)
    return manifestAndDeps
  }

  async getFirstStudy(org) {
    const study = await org.objects.c_study.readOne().execute()
    return study
  }

  async getOrgAndReferences() {
    const { client } = privatesAccessor(this),
          driver = new Driver(client),
          org = new Org(driver),
          { orgReferenceProps } = await this.getOrgObjectInfo(org)
    return { org, orgReferenceProps }
  }

  validateAndCreateManifest(allEntities, orgReferenceProps, ignore = []) {
    const { outputEntities, removedEntities } = this
            .validateReferences(allEntities, orgReferenceProps, ignore),
          manifest = this.createManifest(outputEntities)

    return { manifest, removedEntities }
  }

  // This function is to facilitate unit testing
  async getMappings(org) {
    return getMappingScript(org)
  }

  async buildManifestAndDependencies(manifestJSON, excludeTemplates = false) {
    let ignoreKeys = [],
        cleanManifest,
        study

    const { org, orgReferenceProps } = await this.getOrgAndReferences(),
          ingestTransform = fs.readFileSync(`${__dirname}/../packageScripts/ingestTransform.js`)

    if (manifestJSON) {
      cleanManifest = this.validateAndCleanManifest(manifestJSON)

      ignoreKeys = Object.keys(cleanManifest).map(key => this.mapObjectNameToPlural(key))
    } else {
      study = await this.getFirstStudy(org)
    }

    const mappingScript = await this.getMappings(org),
          allEntities = await this.getStudyManifestEntities(org, study, cleanManifest, orgReferenceProps, excludeTemplates),
          { manifest, removedEntities } = this
            .validateAndCreateManifest(allEntities, orgReferenceProps, ignoreKeys)
    await this.updateWorkflowDependenciesInManifest(org, orgReferenceProps, manifest)
    return {
      manifest,
      removedEntities,
      mappingScript,
      ingestTransform: ingestTransform.toString()
    }
  }

  async writeStudyToDisk({
    manifest, removedEntities, mappingScript, ingestTransform
  }) {
    let extraConfig

    if (mappingScript) {
      extraConfig = this.writeInstallAfterScript(mappingScript)
    }

    this.writeToDisk('study', removedEntities, extraConfig)
  }

  writeInstallAfterScript(mappingScript) {
    const { options } = privatesAccessor(this),
          outputDir = options.dir || process.cwd()

    console.log('Writing post import script')

    const installAfterScript = 'install.after.js'

    const packageReference = {
      scripts: {
        afterImport: installAfterScript
      }
    }

    fs.writeFileSync(`${outputDir}/${installAfterScript}`, mappingScript)

    return packageReference
  }

  writeToDisk(entityType, removedEntities, extraConfig) {
    this.writeIssues(removedEntities)
    this.writePackage(entityType, extraConfig)
  }

  async getTasksManifest(taskIds) {
    console.log('Building Manifest')
    const manifestAndDeps = await this.buildTaskManifestAndDependencies(taskIds)
    this.writeToDisk('task', manifestAndDeps.removedEntities)
    return manifestAndDeps
  }
  async getWorkflowsManifest(workflowIds) {
    console.log('Building workflows Manifest')
    const manifestAndDeps = await this.buildWorkflowManifestAndDependencies(workflowIds)
    this.writeToDisk('workflow', manifestAndDeps.removedEntities)
    return manifestAndDeps
  }

  async getDtConfigsManifest(dtConfigIds) {
    const manifestAndDeps = await this.buildDtConfigManifestAndDependencies(dtConfigIds)
    this.writeToDisk('dt__config', manifestAndDeps.removedEntities)
    return manifestAndDeps
  }

  async buildTaskManifestAndDependencies(taskIds) {
    const { org, orgReferenceProps } = await this.getOrgAndReferences(),
          allEntities = await this.getTaskManifestEntities(org, taskIds, orgReferenceProps),
          { manifest, removedEntities } = this.validateAndCreateManifest(allEntities, orgReferenceProps, ['c_tasks'])

    return { manifest, removedEntities }

  }

  async buildWorkflowManifestAndDependencies(workflowIds) {
    const {org, orgReferenceProps} = await this.getOrgAndReferences()
    const allEntities = await this.getWorkflowManifestEntities(org, workflowIds, orgReferenceProps)
    const {
      manifest,
      removedEntities
    } = this.validateAndCreateManifest(allEntities, orgReferenceProps, ['wf__workflows', 'c_tasks'])
    await this.updateWorkflowDependenciesInManifest(org, orgReferenceProps, manifest)
    return {manifest, removedEntities}
  }

  async buildDtConfigManifestAndDependencies(dtConfigIds) {
    const { org, orgReferenceProps } = await this.getOrgAndReferences(),
        allEntities = await this.getDtConfigManifestEntities(org, dtConfigIds, orgReferenceProps),
        { manifest, removedEntities } = this.validateAndCreateManifest(allEntities, orgReferenceProps, ['dt__configs', 'dt__exports'])

    return { manifest, removedEntities }

  }

  async getConsentsManifest(consentIds) {
    console.log('Building Manifest')
    const manifestAndDeps = await this.buildConsentManifestAndDependencies(consentIds)

    let extraConfig

    if (manifestAndDeps.mappingScript) {
      extraConfig = this.writeInstallAfterScript(manifestAndDeps.mappingScript)
    }

    this.writeToDisk('consent', manifestAndDeps.removedEntities, extraConfig)
    return manifestAndDeps
  }

  async buildConsentManifestAndDependencies(consentIds) {
    const { org, orgReferenceProps } = await this.getOrgAndReferences(),
          mappingScript = await getEcMappingScript(org, consentIds),
          allEntities = await this.getConsentManifestEntities(org, consentIds, orgReferenceProps),
          { manifest, removedEntities } = this.validateAndCreateManifest(allEntities, orgReferenceProps, ['ec__document_templates'])

    return { manifest, removedEntities, mappingScript }
  }

  // This function is not used but it's handy to have for unit tests
  async buildVisitManifestAndDependencies(visitIds) {
    const { org, orgReferenceProps } = await this.getOrgAndReferences(),
          allEntities = await this.getVisitManifestEntities(org, visitIds, orgReferenceProps),
          { manifest, removedEntities } = this.validateAndCreateManifest(allEntities, orgReferenceProps, ['c_visit_schedules'])

    return { manifest, removedEntities }
  }

  // This function is not used but it's handy to have for unit tests
  async buildGroupManifestAndDependencies(groupIds) {
    const { org, orgReferenceProps } = await this.getOrgAndReferences(),
          allEntities = await this.getGroupManifestEntities(org, groupIds, orgReferenceProps),
          { manifest, removedEntities } = this.validateAndCreateManifest(allEntities, orgReferenceProps, ['c_groups'])

    return { manifest, removedEntities }
  }

  createManifest(entities) {
    const manifest = {
      object: 'manifest',
      dependencies: false,
      exportOwner: false,
      importOwner: false
    }

    entities.forEach((entity) => {
      const uniqueKey = this.getKeyName(entity.object)
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
    let outputEntities = []
    const removedEntities = []

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

    // check if from the output entities depend on some of the removed entities
    const dependencyIssues = this.getDependencyIssues(outputEntities, removedEntities)

    if (dependencyIssues.length) {
      removedEntities.push(...dependencyIssues)

      // recalulate output entities
      outputEntities = outputEntities
        .filter((outputEntity) => {
          const isRemoved = dependencyIssues.find(({ entity }) => entity._id === outputEntity._id)
          return !isRemoved
        })
    }

    this.checkExportIntegrity(outputEntities, removedEntities)

    if (removedEntities.length) {
      console.log('\x1b[1m\x1b[31m\x1b[40m%s\x1b[0m', 'Referential Integrity Errors Found')
      console.log('\x1b[1m\x1b[31m\x1b[40m%s\x1b[0m', 'Please check issuesReport.json for more details')
    }

    return { outputEntities, removedEntities }
  }

  checkExportIntegrity(outputEntities, removedEntities) {
    this.checkEcIntegrity(outputEntities)
    const studyRemoved = removedEntities.find(entityWrapper => entityWrapper.entity.object === 'c_study')
    if (studyRemoved) {
      throw Fault.create('kInvalidArgument', { message: 'Study cannot be exported due to referential integrity issues', reason: JSON.stringify(studyRemoved.issues) })
    }
  }

  checkEcIntegrity(entities) {
    // if study has EC templates and no default css, throw error and do not export
    let hasDefaultDocCss

    const hasEcTemplates = entities.some(entity => entity.object === 'ec__document_template')

    if (hasEcTemplates) {
      hasDefaultDocCss = entities.some(entity => entity.object === 'ec__default_document_css')

      if (!hasDefaultDocCss) {
        throw Fault.create('kInvalidArgument', {
          message: 'Export cannot be completed because there is no ec__default_document_css',
          reason: 'Exports that contain EC templates must also contain an EC default document CSS'
        })
      }
    }
  }

  /**
   * Checks if there are dependency issues from existing issues
   * For example: if a patient flag has been flagged as removed entity then we also need to prevent
   * other entities that may be using that flag from being exported too
   */
  getDependencyIssues(outputEntities, removedEntitiesAndIssues) {
    const removedEntities = removedEntitiesAndIssues
      .map(({ entity }) => entity)
      .reduce((acc, entity) => ({ ...acc, [entity._id]: entity }), {})

    const dependentEntitiesToRemove = outputEntities
      .map((entity) => {
        const allIds = this.getIdsFromEntity(entity)

        const issues = allIds
        // only get the ones with removed entities
          .filter(id => !!removedEntities[id])
          .map((id) => {

            const entityRemoved = removedEntities[id]
            return `The object ${entity.object} (${entity._id}) is removed from export because it depends on ${entityRemoved.object} (${entityRemoved._id}) which has issues`
          })

        return { entity, issues }
      })
      .filter(({ issues }) => issues.length)

    return dependentEntitiesToRemove
  }

  /**
   * Recursively get all the ObjectIds from a given entity
   */
  getIdsFromEntity(entity) {
    const objectIdRegex = /^[a-f\d]{24}$/i

    const entityIds = []

    if (isArray(entity)) {
      const subPropsInArray = entity
        .map(prop => this.getIdsFromEntity(prop))
        .reduce((acc, curr) => acc.concat(curr), [])

      entityIds.push(...subPropsInArray)
    } else if (isObject(entity)) {

      Object.keys(entity)
        .forEach((key) => {

          if (key === '_id') {
            entityIds.push(entity[key])
          } else {
            const propertyValue = entity[key]

            const subPropIds = this.getIdsFromEntity(propertyValue)
            entityIds.push(...subPropIds)
          }
        })
    } else if (objectIdRegex.test(entity)) {
      entityIds.push(entity)
    }

    return entityIds
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
          let referenceIds = documents
            .map(document => this.getIdsByReferenceType(document, ref.documents))
          // flatten
            .reduce(
              (flatAcc, foundReferences) => {
                const existingReferences = foundReferences.filter(foundReference => foundReference.referenceIds.length)

                existingReferences.forEach((existingReference) => {
                  const accumulatedRef = flatAcc.find(refAcc => refAcc.reference === existingReferences.reference)

                  if (accumulatedRef) {
                    accumulatedRef.referenceIds.push(...existingReference.referenceIds)
                  } else {
                    flatAcc.push(existingReference)
                  }

                })

                return flatAcc
              }, []
            )

          referenceIds = referenceIds
            .reduce((acc, referenceId) => {

              referenceId
                .referenceIds
                .forEach((subRef) => {
                  const existingSubRef = acc.find(accRef => accRef._id === subRef._id)

                  if (!existingSubRef) {
                    acc.push(subRef)
                  }
                })

              return acc
            }, [])

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
    const removedEntityIds = []

    refEntityIds.forEach(({ reference, referenceIds, required }) => {

      const hasReferences = referenceIds.length > 0,
            hasNoReferenceAndRequired = required && referenceIds.length === 0

      if (hasReferences) {

        referenceIds.forEach(({ _id: refEntityId, reference: subReference }) => {
          const refEntity = entities.find(v => v._id === refEntityId)

          if (!refEntity) {
            const issue = `The object ${entity.object} (${entity._id}) is removed from export because it depends on ${subReference} (${refEntityId}) which doesn't exist`
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
          paths = [uniqueKey, ...refProps]

    console.log(`Getting ${object}`)

    const data = await this.getExportArray(org, object, where, paths)

    if (data.length && data[0].object === 'fault') {
      throw data[0]
    }

    return data
  }

  async getWorkflowNotifications(org, notificationNames) {
    if (!notificationNames || !notificationNames.length) {
      return []
    }
    const orgDetails = await org.driver.list('org')
    return getProperty(orgDetails, 'data[0].configuration.notifications', []).filter(n => notificationNames.includes(n.name))
  }

  async getExportArray(org, object, where, paths) {

    switch (object) {

      // Workaround until AXONCONFIG-2581 gets implemented
      case 'ec__knowledge_checks': {

        const pathsInObjectForm = paths
          .reduce((acc, curr) => ({
            ...acc,
            [curr]: 1
          }), {
            object: 1
          })

        const results = await org.objects
          .ec__document_templates
          .aggregate([
            {
              $match: where
            },
            {
              $project: {
                ec__knowledge_checks: {
                  $expand: {
                    // we assume there won't be more than 1k knowledge checks per template
                    limit: 1000,
                    pipeline: [{
                      $project: pathsInObjectForm
                    }]
                  }
                }
              }
            }
          ])
          .limit(500000)
          .toArray()

        return results.reduce((acc, curr) => acc.concat(curr.ec__knowledge_checks.data), [])
      }
      default:
        return org.objects[object].find(where)
          .paths(paths)
          .limit(false)
          .toArray()
    }

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

  getExportableObjects() {
    return privatesAccessor(this).orgObjects
      .filter(({ uniqueKey }) => uniqueKey && uniqueKey !== 'mig__key')
      .map(({ name }) => name)
  }

  getKeyName(key) {
    return privatesAccessor(this).orgObjects
      .find(({ name }) => name === key).uniqueKey
  }

  async getStudyManifestEntities(org, study, manifestObject, orgReferenceProps, excludeTemplates = false) {
    const manifestEntities = [],
          // Get all objects that can be exported
          exportableObjects = this.getExportableObjects(),
          // Define the available entities to export or get them from the manifest in input
          availableKeys = study ? this.getAvailableObjectNames() : Object.keys(manifestObject),
          // Amongst the available keys, retrieve the ones that can actually be exported depending on the study
          manifestKeys = intersection(availableKeys, exportableObjects)

    // eslint-disable-next-line no-restricted-syntax
    for await (const key of manifestKeys) {
      // Determine whether queriying by c_study or c_key
      const property = (study) ? 'c_study' : this.getKeyName(key),
            // Use the study ID or the entities inside the "includes" array in the manifest
            values = (study) ? [study._id] : manifestObject[key].includes

      let ids,
          pluralName,
          objectAndDependencies

      switch (key) {
        case 'c_task': {
          // Get the Tasks ID's from the study or the manifest
          ids = (await this.getObjectIDsArray(org, key, property, values)).map(v => v._id)
          // Load the manifest for the current ID's and their dependencies
          objectAndDependencies = await this.getTaskManifestEntities(org, ids, orgReferenceProps)
          break
        }
        case 'wf__workflow': {
          if(!(await this.isWorkflowSupported())){
            break
          }
          // Get all the workflow ID's from the org
          ids = await this.getAllObjectIDsArray(org, key)
          objectAndDependencies = await this.getWorkflowManifestEntities(org, ids, orgReferenceProps)
          break
        }
        case 'ec__document_template': {
          if (!excludeTemplates) {
            // Get the eConsents ID's from the study or the manifest
            // econsent template properties are namespaced ec__, rather than c_
            const ecProp = property === 'c_study' ? 'ec__study' : property
            ids = (await this.getObjectIDsArray(org, key, ecProp, values)).map(v => v._id)
            // Load the manifest for the current ID's and their dependencies
            objectAndDependencies = await this.getConsentManifestEntities(org, ids, orgReferenceProps)
          }
          break
        }
        case 'c_visit_schedule': {
          // Get the Visit Schedules ID's from the study or the manifest
          ids = (await this.getObjectIDsArray(org, key, property, values)).map(v => v._id)
          // Load the manifest for the current ID's and their dependencies
          objectAndDependencies = await this.getVisitManifestEntities(org, ids, orgReferenceProps)
          break
        }
        case 'c_group': {
          // Get the Groups ID's from the study or the manifest
          ids = (await this.getObjectIDsArray(org, key, property, values)).map(v => v._id)
          // Load the manifest for the current ID's and their dependencies
          objectAndDependencies = await this.getGroupManifestEntities(org, ids, orgReferenceProps)
          break
        }
        // Altough c_fault has reference to c_study it will not be included in the below list since that reference is not used
        // If we included it c_fault will not get exported in a full study export
        case 'c_anchor_date_template':
        case 'c_participant_schedule':
        case 'c_patient_flag':
        case 'c_site': {
          try {
            // If there's no plural form for current key or the current key does not exist (older studies), use the key itself
            pluralName = this.mapObjectNameToPlural(key)
          } catch (e) {
            pluralName = key
          }
          // These objects seem not to have dependencies so we'll load them directly
          objectAndDependencies = await this.getExportObjects(org, pluralName, { [property]: { $in: values } }, orgReferenceProps)
          break
        }
        default: {
          try {
            // If there's no plural form for current key, use the key itself
            pluralName = this.mapObjectNameToPlural(key)
          } catch (e) {
            pluralName = key
          }
          const where = property !== 'c_study' ? { [property]: { $in: values } } : null
          // Allow to export individual instances (if specified) or all of them
          objectAndDependencies = await this.getExportObjects(org, pluralName, where, orgReferenceProps)
          break
        }
      }
      // Push the deconstructed object
      manifestEntities.push(...(objectAndDependencies || []))
    }

    return manifestEntities
  }

  async getObjectIDsArray(org, key, property, values) {
    return org.objects[key].find({ [property]: { $in: values } }).limit(false).toArray()
  }

  async getAllObjectIDsArray(org, key) {
    return (await org.objects[key].find().paths('_id').limit(false).toArray()).map(wf => wf._id)
  }

  async getTaskManifestEntities(org, taskIds, orgReferenceProps) {

    const tasks = await this.getExportObjects(org, 'c_tasks', { _id: { $in: taskIds } }, orgReferenceProps),
          steps = await this.getExportObjects(org, 'c_steps', { c_task: { $in: tasks.map(v => v._id) } }, orgReferenceProps),
          branches = await this.getExportObjects(org, 'c_branches', { c_task: { $in: tasks.map(v => v._id) } }, orgReferenceProps)

    return [...tasks, ...steps, ...branches]
  }

  async validateWorkflowNotificationsPresentInOrg(org, workflowObjects) {
    const notificationsList = await org.objects.org.find().paths('configuration.notifications').limit(false).toArray()
    const notificationsObjectList = notificationsList[0].configuration.notifications
    const notificationsNamesList = notificationsObjectList.map(item => { return item.name;})
    const notificationsInWorkflow = uniq(workflowObjects.map(wf => getProperty(wf, 'wf__actions', []).map(a => getProperty(a, 'wf__params.wf__notification_name')).filter(e => !!e)).flat())

    const missingNotificationNames = difference(notificationsInWorkflow, notificationsNamesList)
    if (missingNotificationNames.length > 0) {
      throw Fault.create('kInvalidArgument', {
        message: `Workflow ID notification not present: ${missingNotificationNames.join(', ')}`
      })
    }
  }

  async validateWorkflowStepReferencePresentInOrg(org, workflowObjects) {
    const conditionInclusionStepNames = workflowObjects.map(wf => getProperty(wf, 'wf__conditions_inclusion', []).map(a => getProperty(a, 'wf__params.wf__step')).filter(e => !!e)).flat()
    const conditionExclusionStepNames = workflowObjects.map(wf => getProperty(wf, 'wf__conditions_exclusion', []).map(a => getProperty(a, 'wf__params.wf__step')).filter(e => !!e)).flat()
    const stepKeys = uniq(conditionInclusionStepNames.concat(conditionExclusionStepNames))
    const stepIds = await org.objects.c_step.find({c_key: {$in: stepKeys}}).paths('_id').limit(false).toArray()

    if (stepIds.length !== stepKeys.length) {
      throw Fault.create('kInvalidArgument', {
        message: 'Workflow Step not found',
        reason: `Step not found for the step keys: ${difference(stepKeys, stepIds.map(s => s.c_key)).join(', ')}`
      })
    }
  }

  async validateWorkflowTasksPresentInOrg(taskIds, workflowTaskKeys) {
    if (taskIds.length !== workflowTaskKeys.length) {
      throw Fault.create('kInvalidArgument', {
        message: 'Workflow Tasks not found',
        reason: `Tasks not found for the task keys: ${difference(workflowTaskKeys, taskIds.map(t => t.c_key)).join(', ')}`
      })
    }
  }

  async getWorkflowManifestEntities(org, workflowIds, orgReferenceProps) {
    const workflowObjects = await org.objects.wf__workflow.find({_id: {$in: workflowIds}}).limit(false).toArray();
    const workflowTaskKeys = uniq(workflowObjects.map(v => getProperty(v, 'wf__start.wf__params.wf__tasks')).flat())
    const workflows = await this.getExportObjects(org, 'wf__workflows', {_id: {$in: workflowIds}}, orgReferenceProps)

    const taskIds = await org.objects.c_task.find({c_key: {$in: workflowTaskKeys}}).paths('_id').limit(false).toArray()

    await this.validateWorkflowTasksPresentInOrg(taskIds, workflowTaskKeys)
    await this.validateWorkflowNotificationsPresentInOrg(org, workflowObjects)
    await this.validateWorkflowStepReferencePresentInOrg(org, workflowObjects)

    const tasks = await this.getTaskManifestEntities(org, taskIds.map(t => t._id), orgReferenceProps)

    return [...workflows, ...tasks]
  }

  async updateWorkflowDependenciesInManifest(org, orgReferenceProps, manifest) {
    const workflowKeys = getProperty(manifest, 'wf__workflow.includes', [])
    if(!workflowKeys.length){
      return
    }
    const workflowObjects = await org.objects.wf__workflow.find({wf__key: {$in: workflowKeys}}).toArray();
    const notificationNames = workflowObjects.map(wf => getProperty(wf, 'wf__actions', []).map(a => getProperty(a, 'wf__params.wf__notification_name')).filter(e => !!e)).flat()
    const notifications = await this.getWorkflowNotifications(org, notificationNames, orgReferenceProps)
    if (notifications && notifications.length) {
      manifest.notifications = {includes: notifications.map(n => n.name)}
      const endpoints = notifications.map(n => n.endpoints).flat()
      manifest.templates = {includes: endpoints.map(ep => `${ep.name}.${ep.template}`)}
    }
  }

  async getDtConfigManifestEntities(org, dtConfigIds, orgReferenceProps) {

    const dtConfigs = await this.getExportObjects(org, 'dt__configs', { _id: { $in: dtConfigIds } }, orgReferenceProps),
        dtExecutions = await this.getExportObjects(org, 'dt__executions', { dt__config: { $in: dtConfigs.map(v => v._id) } }, orgReferenceProps),
        dtExports = await this.getExportObjects(org, 'dt__exports', { dt__config: { $in: dtConfigs.map(v => v._id) } }, orgReferenceProps)
    return [...dtConfigs, ...dtExecutions, ...dtExports]
  }

  async getConsentManifestEntities(org, consentId, orgReferenceProps) {

    const documentTemplates = await this.getExportObjects(org, 'ec__document_templates', { _id: { $in: consentId } }, orgReferenceProps),
          knowledgeChecks = await this.getExportObjects(org, 'ec__knowledge_checks', { _id: { $in: documentTemplates.map(v => v._id) } }, orgReferenceProps),
          defaultCSS = await this.getExportObjects(org, 'ec__default_document_csses', null, orgReferenceProps)

    return [...documentTemplates, ...knowledgeChecks, ...defaultCSS]
  }

  async getVisitManifestEntities(org, visitIds, orgReferenceProps) {
    const visitSchedules = await this.getExportObjects(org, 'c_visit_schedules', { _id: { $in: visitIds } }, orgReferenceProps),
          visits = await this.getExportObjects(org, 'c_visits', { c_visit_schedules: { $in: visitSchedules.map(v => v._id) } }, orgReferenceProps)

    return [...visitSchedules, ...visits]
  }

  async getGroupManifestEntities(org, groupIds, orgReferenceProps) {
    const groups = await this.getExportObjects(org, 'c_groups', { _id: { $in: groupIds } }, orgReferenceProps),
          groupTasks = await this.getExportObjects(org, 'c_group_tasks', { c_group: { $in: groups.map(v => v._id) } }, orgReferenceProps)

    return [...groups, ...groupTasks]
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

  writePackage(entity, externalConfig) {
    let packageFile = JSON.parse(fs.readFileSync(path.join(packageFileDir, 'package.json'), 'UTF8'))
    const { options } = privatesAccessor(this),
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
      case 'dt__config': {
        packageFile.name = 'Config export'
        packageFile.description = 'An export of dt config or multiple dt configs'
        break
      }
      case 'consent': {
        packageFile.name = 'Consent export'
        packageFile.description = 'An export of consent template or multiple consent templates'
        break
      }
      case 'workflow': {
        packageFile.name = 'Workflow export'
        packageFile.description = 'An export of workflow or multiple workflows'
        break
      }
    }

    packageFile.pipes.ingest = ingestScript

    if (externalConfig) {
      packageFile = {
        ...packageFile,
        ...externalConfig
      }
    }

    fs.copyFileSync(path.join(packageFileDir, ingestScript), path.join(outputDir, ingestScript))

    fs.writeFileSync(`${outputDir}/package.json`, JSON.stringify(packageFile, null, 2))
  }

}

module.exports = StudyManifestTools

