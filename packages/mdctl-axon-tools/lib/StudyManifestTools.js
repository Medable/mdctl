/* eslint-disable no-underscore-dangle */
/* eslint-disable newline-per-chained-call */
const fs = require('fs'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      { Driver } = require('@medable/mdctl-api-driver'),
      { Org } = require('@medable/mdctl-api-driver/lib/cortex.object'),
      path = require('path'),
      packageFileDir = path.join(__dirname, '../packageScripts')

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
          orgReferenceProps = allObj.reduce((a, obj) => {
            obj.properties.forEach((prop) => {
              if (prop.type === 'Reference' || (prop.type === 'ObjectId' && prop.sourceObject)) {
                if (!a[obj.pluralName]) {
                  // eslint-disable-next-line no-param-reassign
                  a[obj.pluralName] = []
                }

                a[obj.pluralName].push({
                  name: prop.name,
                  array: !!prop.array,
                  object: prop.sourceObject,
                  type: prop.type
                })
              }

              if (prop.properties) {
                prop.properties.forEach((subProp) => {
                  if (prop.type === 'Reference' || (prop.type === 'ObjectId' && prop.sourceObject)) {
                    if (!a[obj.pluralName]) {
                      // eslint-disable-next-line no-param-reassign
                      a[obj.pluralName] = []
                    }

                    a[obj.pluralName].push({
                      name: `${prop.name}.${subProp.name}`,
                      array: !!subProp.array,
                      object: subProp.sourceObject,
                      type: subProp.type
                    })
                  }
                })
              }
            })
            return a
          }, {})

    Object.assign(privatesAccessor(this), {
      orgObjects: allObj.map(({ name, pluralName, uniqueKey }) => ({ name, pluralName, uniqueKey }))
    })

    return { orgReferenceProps }

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
          manifest = this.createManifest(outputEntities)

    this.writeIssues(removedEntities)
    this.writePackage('study')


    return { manifest, removedEntities }

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
        'c_default_participant_schedule'
      ]
    }

    return manifest

  }

  validateReferences(entities, orgReferenceProps, ignore = []) {
    console.log('Validating Internal References')
    const outputEntities = [],
          removedEntities = []

    entities.forEach((entity) => {
      const issues = [],
            pluralName = this.mapObjectNameToPlural(entity.object),
            references = ignore.includes(pluralName) ? [] : orgReferenceProps[pluralName]
      let valid = true

      references.forEach((ref) => {
        if (entity[ref.name]) {
          const refEntityIds = []

          if (ref.type === 'Reference') {
            refEntityIds.push(entity[ref.name]._id)
          } else if (ref.array) {
            if (!entity[ref.name].length) return
            refEntityIds.push(...entity[ref.name])
          } else {
            refEntityIds.push(entity[ref.name])
          }

          if (refEntityIds.length) {
            refEntityIds.forEach((refEntityId) => {
              const refEntity = entities.find(v => v._id === refEntityId)

              if (!refEntity) {
                valid = false
                const issue = `Entity not found in export for ${entity.object} ${entity._id} for reference ${ref.name} id ${refEntityId}`
                issues.push(issue)
              }
            })
          } else {
            valid = false
            const issue = `No entity id for ${entity.object} ${entity._id} for reference ${ref.name}`
            issues.push(issue)
          }
        }
      })

      if (valid) {
        outputEntities.push(entity)
      } else {
        removedEntities.push({ entity, issues })
      }

    })

    return { outputEntities, removedEntities }

  }

  async getExportObjects(org, object, where, orgReferenceProps) {

    if (!privatesAccessor(this).orgObjects.find(v => v.pluralName === object)) return []

    const { orgObjects } = privatesAccessor(this),
          { uniqueKey } = orgObjects.find(v => v.pluralName === object),
          paths = [uniqueKey, ...orgReferenceProps[object].map(v => v.name)],
          expand = [...orgReferenceProps[object].filter(v => v.type === 'Reference').map(v => v.name)],
          cursor = org.objects[object].find(where)
            .paths(paths)
            .limit(false)

    if (expand.length) {
      cursor.expand(expand)
    }

    console.log(`Getting ${object}`)
    // eslint-disable-next-line one-var
    const data = await cursor.toArray()

    if (data.length && data[0].object === 'fault') {
      throw data[0]
    }
    return data

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

          taskAssignments = await this.getExportObjects(org, 'c_task_assignments', null, orgReferenceProps),
          participantSchedules = await this.getExportObjects(org, 'c_participant_schedules', null, orgReferenceProps),
          patientFlags = await this.getExportObjects(org, 'c_patient_flags', null, orgReferenceProps),

          documentTemplates = await this.getExportObjects(org, 'ec__document_templates', { ec__study: study._id }, orgReferenceProps),
          knowledgeChecks = await this.getExportObjects(org, 'ec__knowledge_checks', { ec__document_template: { $in: documentTemplates.map(v => v._id) } }, orgReferenceProps),
          defaultDoc = await this.getExportObjects(org, 'ec__default_document_css', null, orgReferenceProps)

    return [...tasks, ...steps, ...branches,
      ...visitSchedules, ...visits, ...groups, ...faults, ...reports,
      ...groupTasks, ...taskAssignments, ...participantSchedules,
      ...patientFlags, ...documentTemplates, ...knowledgeChecks, ...defaultDoc]
  }

  async getTaskManifestEntities(org, taskIds, orgReferenceProps) {

    const tasks = await this.getExportObjects(org, 'c_tasks', { _id: { $in: taskIds } }, orgReferenceProps),
          steps = await this.getExportObjects(org, 'c_steps', { c_task: { $in: tasks.map(v => v._id) } }, orgReferenceProps),
          branches = await this.getExportObjects(org, 'c_branches', { c_task: { $in: tasks.map(v => v._id) } }, orgReferenceProps)

    return [...tasks, ...steps, ...branches]
  }

  async getConsentManifestEntities(org, consentId, orgReferenceProps) {

    const documentTemplates = await this.getExportObjects(org, 'ec__document_templates', { _id: { $in: consentId } }, orgReferenceProps),
          knowledgeChecks = await this.getExportObjects(org, 'ec__knowledge_checks', { ec__document_template: { $in: documentTemplates.map(v => v._id) } }, orgReferenceProps)

    return [...documentTemplates, ...knowledgeChecks]
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
    fs.copyFileSync(path.join(packageFileDir, ingestScript), path.join(outputDir, ingestScript))

    fs.writeFileSync(`${outputDir}/package.json`, JSON.stringify(packageFile, null, 2))
  }

}

module.exports = StudyManifestTools
