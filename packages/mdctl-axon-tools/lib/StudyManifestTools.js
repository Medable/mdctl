/* eslint-disable no-underscore-dangle */
/* eslint-disable newline-per-chained-call */
const fs = require('fs')
const { privatesAccessor } = require('@medable/mdctl-core-utils/privates')
const _ = require('lodash')
const { Driver } = require('@medable/mdctl-api-driver')
const { Org } = require('@medable/mdctl-api-driver/lib/cortex.object')

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

    return org.objects.ec__document_templates.find().limit(false).paths('c_name').toArray()
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

    this.orgObjects = allObj.map(({ name, pluralName }) => ({ name, pluralName }))

    return { orgReferenceProps }

  }

  mapObjectNameToPlural(name) {
    return this.orgObjects.find(v => v.name === name).pluralName
  }

  mapObjectPluralToName(pluralName) {
    return this.orgObjects.find(v => v.pluralName === pluralName).name
  }

  async getStudyManifest() {
    console.log('Building Manifest')
    const { client, options } = privatesAccessor(this),
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

    return { manifest, removedEntities }

  }

  async getTasksManifest(taskIds) {
    console.log('Building Manifest')
    const { client, options } = privatesAccessor(this),
          driver = new Driver(client),
          org = new Org(driver),
          { orgReferenceProps } = await this.getOrgObjectInfo(org),
          allEntities = await this.getTaskManifestEntities(org, taskIds, orgReferenceProps),
          { outputEntities, removedEntities } = this.validateReferences(allEntities, orgReferenceProps, ['c_tasks']),
          manifest = this.createManifest(outputEntities)

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
      if (!manifest[entity.object]) {
        manifest[entity.object] = {
          includes: []
        }
      }
      manifest[entity.object].includes.push(entity.c_key)

    })

    if (manifest.c_study) {
      manifest.c_study.defer = [
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
      // for (const ref of references) {
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
                // console.log(issue)
              }
            })
          } else {
            valid = false
            const issue = `No entity id for ${entity.object} ${entity._id} for reference ${ref.name}`
            issues.push(issue)
            // console.log(issue)
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
    console.log(`Getting ${object}`)
    if (!this.orgObjects.find(v => v.pluralName === object)) return []

    const paths = ['c_key', ...orgReferenceProps[object].map(v => v.name)],
          expand = [...orgReferenceProps[object].filter(v => v.type === 'Reference').map(v => v.name)],

          cursor = org.objects[object].find(where)
            .paths(paths)
            .limit(false)

    if (expand.length) {
      cursor.expand(expand)
    }

    return cursor.toArray()

  }

  async getStudyManifestEntities(org, study, orgReferenceProps) {

    const tasks = await this.getExportObjects(org, 'c_tasks', { c_study: study._id }, orgReferenceProps),
          steps = await this.getExportObjects(org, 'c_steps', { c_task: { $in: tasks.map(v => v._id) } }, orgReferenceProps),
          branches = await this.getExportObjects(org, 'c_branches', { c_task: { $in: tasks.map(v => v._id) } }, orgReferenceProps),
          visitSchedules = await this.getExportObjects(org, 'c_visit_schedules', { c_study: study._id }, orgReferenceProps),
          visits = await this.getExportObjects(org, 'c_visits', { c_visit_schedules: { $in: visitSchedules.map(v => v._id) } }, orgReferenceProps),
          groups = await this.getExportObjects(org, 'c_groups', { c_study: study._id }, orgReferenceProps),
          groupTasks = await this.getExportObjects(org, 'c_group_tasks', { c_group: { $in: groups.map(v => v._id) } }, orgReferenceProps),

          taskAssignments = await this.getExportObjects(org, 'c_task_assignments', null, orgReferenceProps),
          participantSchedules = await this.getExportObjects(org, 'c_participant_schedules', null, orgReferenceProps),
          patientFlags = await this.getExportObjects(org, 'c_patient_flags', null, orgReferenceProps),

          documentTemplates = await this.getExportObjects(org, 'ec__document_templates', { ec__study: study._id }, orgReferenceProps),
          knowledgeChecks = await this.getExportObjects(org, 'ec__knowledge_ckecks', { ec__document_template: { $in: documentTemplates.map(v => v._id) } }, orgReferenceProps)

    return [...tasks, ...steps, ...branches,
      ...visitSchedules, ...visits, ...groups,
      ...groupTasks, ...taskAssignments, ...participantSchedules,
      ...patientFlags, ...documentTemplates, ...knowledgeChecks]
  }

  async getTaskManifestEntities(org, taskIds, orgReferenceProps) {

    const tasks = await this.getExportObjects(org, 'c_tasks', { _id: { $in: taskIds } }, orgReferenceProps),
          steps = await this.getExportObjects(org, 'c_steps', { c_task: { $in: tasks.map(v => v._id) } }, orgReferenceProps),
          branches = await this.getExportObjects(org, 'c_branches', { c_task: { $in: tasks.map(v => v._id) } }, orgReferenceProps)

    return [...tasks, ...steps, ...branches]
  }

  async getConsentManifestEntities(org, consentId, orgReferenceProps) {

    const documentTemplates = await this.getExportObjects(org, 'ec__document_templates', { _id: { $in: [consentId] } }, orgReferenceProps),
          knowledgeChecks = await this.getExportObjects(org, 'ec__knowledge_ckecks', { ec__document_template: { $in: documentTemplates.map(v => v._id) } }, orgReferenceProps)

    return [...documentTemplates, ...knowledgeChecks]
  }

}

module.exports = StudyManifestTools
