/***********************************************************

 @script     eConsent - eConsent Template Manager

 @brief      Desc

 @author     Fiachra Matthews

 (c)2020 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import _ from 'underscore'
import EconsentUtilities from 'ec__econsent_utilities_lib'
const { ec__document_templates, ec__knowledge_checks, objects } = org.objects

class TemplateCloner {

  static cleanObject(obj) {
    if (obj._id) {
      delete obj._id
    }

    if (obj.object) {
      delete obj.object
    }

    if (obj.ec__key) {
      delete obj.ec__key
    }

    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        obj[key] = value.map(v => this.cleanObject(v))
      } else if (typeof value === 'object') {
        if (value.object && value._id && value.path) {
          obj[key] = value._id
        }
      }
    }

    return obj
  }

  static transformKnowledgeChecksForInsertion(knowledgeChecksRef, templateId) {
    if (knowledgeChecksRef.object === 'list' && Array.isArray(knowledgeChecksRef.data)) {
      return knowledgeChecksRef.data.map(ref => {
        return {
          ec__answer_context: ref.ec__answer_context,
          ec__options: ref.ec__options,
          ec__options_answer: ref.ec__options_answer,
          ec__signer_role: ref.ec__signer_role,
          ec__description: ref.ec__description,
          ec__label: ref.ec__label,
          ec__optional: ref.ec__optional,
          ec__question: ref.ec__question,
          ec__type: ref.ec__type,
          ec__identifier: `${ref.ec__identifier}-${EconsentUtilities.generateRandomAlphabeticalSequence(4)}`,
          ec__document_template: templateId
        }
      })
    } else {
      return undefined
    }
  }

  static processAsset(asset) {
    const newAsset = _.pick(asset, 'ec__filename', 'ec__type')

    newAsset.ec__file = {
      content: `facet://${asset.ec__file.path}`
    }

    return newAsset
  }

  static getTemplateClone(_id, updateVersion) {
    const props = objects.find({ name: 'ec__document_template' })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .next().properties.map(v => v.name)

    const template = ec__document_templates.find({ _id })
      .paths(props)
      .next()

    const newVersion = TemplateVersionManager.getNextMinorVersion(template)

    const cleanTemplate = this.cleanObject(template)

    // Remove linked field values for the new template as we will populate them again on publish
    delete cleanTemplate.ec__linked_fields
    cleanTemplate.ec__status = 'draft'
    cleanTemplate.ec__assets = cleanTemplate.ec__assets
    // ECO-269
      .filter(v => v.ec__file.state === 2)
      .map(v => this.processAsset(v))
    cleanTemplate.ec__title += ` CLONE-${EconsentUtilities.generateRandomDigitSequence(5)}`

    if (cleanTemplate.ec__identifier) {
      delete cleanTemplate.ec__identifier
    }

    if (cleanTemplate.ec__published) {
      delete cleanTemplate.ec__published
    }

    if (cleanTemplate.ec__publishing) {
      delete cleanTemplate.ec__publishing
    }

    if (updateVersion) {
      cleanTemplate.ec__version = newVersion

      if (!cleanTemplate.ec__parent_template) {
        cleanTemplate.ec__parent_template = _id
      }
    } else {
      cleanTemplate.ec__version = '0.1'
      if (cleanTemplate.ec__parent_template) {
        delete cleanTemplate.ec__parent_template
      }
    }

    const currentKnowledgeChecks = cleanTemplate.ec__knowledge_checks
    if (cleanTemplate.ec__knowledge_checks) {
      delete cleanTemplate.ec__knowledge_checks
    }

    if (cleanTemplate.ec__pts_document && cleanTemplate.ec__pts_document.path) {
      cleanTemplate.ec__pts_document = {
        content: `facet://${cleanTemplate.ec__pts_document.path}`
      }
    }

    const newTemplate = ec__document_templates.insertOne(cleanTemplate)
      .lean(false)
      .execute()
    const knowledgeCheckInserts = this.transformKnowledgeChecksForInsertion(currentKnowledgeChecks, newTemplate._id)
    ec__knowledge_checks.insertMany(knowledgeCheckInserts)
      .execute()

    const matchingKeys = []

    const oldTemplate = ec__document_templates.find({ _id })
      .paths(props)
      .next()

    const [newKnowledgeChecks] = ec__document_templates.find({ _id: newTemplate._id })
      .paths('ec__knowledge_checks')
      .toArray()
    if (newKnowledgeChecks && newKnowledgeChecks.ec__knowledge_checks && newKnowledgeChecks.ec__knowledge_checks.data) {
      matchingKeys.push(...this.getMatchingIds(currentKnowledgeChecks, newKnowledgeChecks.ec__knowledge_checks, 'data', 'ec__identifier', true))
    }

    matchingKeys.push(...this.getMatchingIds(oldTemplate, newTemplate, 'ec__requested_signatures', 'ec__title'))
    matchingKeys.push(...this.getMatchingIds(oldTemplate, newTemplate, 'ec__requested_data', 'ec__title'))
    matchingKeys.push(...this.getMatchingIds(oldTemplate, newTemplate, 'ec__assets', 'ec__filename'))

    return this.updateDocumentIds(newTemplate, matchingKeys, props)
  }

  static getMatchingIds(oldDoc, newDoc, arrayProp, uniqueArrayProp, matchPrefix = false) {
    return oldDoc[arrayProp].reduce((a, v) => {
      let match = {}
      if (matchPrefix) {
        match = newDoc[arrayProp].find(f => f[uniqueArrayProp].startsWith(v[uniqueArrayProp]))
      } else {
        match = newDoc[arrayProp].find(f => f[uniqueArrayProp] === v[uniqueArrayProp])
      }

      // ECO-269
      if (!match) return a

      a.push({
        oldVal: v.ec__key,
        newVal: match.ec__key
      })

      a.push({
        oldVal: v._id,
        newVal: match._id
      })

      return a
    }, [])
  }

  static updateDocumentIds(newDocument, matchingKeys, props) {

    if (newDocument.ec__html && newDocument.ec__builder_data) {
      const update = {
        ec__html: newDocument.ec__html,
        ec__builder_data: Object.assign({}, newDocument.ec__builder_data)
      }

      matchingKeys.forEach(v => {
        const re = new RegExp(v.oldVal, 'g')

        if (update.ec__builder_data['ck-widgets-data']) {
          for (const widgetData of update.ec__builder_data['ck-widgets-data']) {
            for (const [key, value] of Object.entries(widgetData)) {
              if (String(value) === String(v.oldVal)) {
                widgetData[key] = v.newVal
              }
              if (key === 'data') {
                for (const [dataKey, dataValue] of Object.entries(widgetData[key])) {
                  if (String(dataValue) === String(v.oldVal)) {
                    widgetData[key][dataKey] = v.newVal
                  }
                }
              }
            }
          }
        }
        if (update.ec__builder_data['ck-html']) {
          update.ec__builder_data['ck-html'] = update.ec__builder_data['ck-html'].replace(re, v.newVal)
        }
        if (update.ec__builder_data['gjs-html']) {
          update.ec__builder_data['gjs-html'] = update.ec__builder_data['gjs-html'].replace(re, v.newVal)
        }
        if (update.ec__builder_data['gjs-components']) {
          update.ec__builder_data['gjs-components'] = update.ec__builder_data['gjs-components'].replace(re, v.newVal)
        }
        update.ec__html = update.ec__html.replace(re, v.newVal)
      })

      return ec__document_templates.updateOne({ _id: newDocument._id }, { $set: update })
        .paths(props)
        .lean(false)
        .execute()

    } else {
      return newDocument
    }

  }

}

class TemplateVersionManager {

  static versionRegex = /^([0-9]+)(\.([0-9]+))?$/

  static getNextMinorVersion(currentDoc) {
    const { major: currentMajor } = this.getComponents(currentDoc.ec__version)

    const ec__parent_template = (currentDoc.ec__parent_template && currentDoc.ec__parent_template._id) || currentDoc._id

    const maxMinor = ec__document_templates.find({ $or: [{ ec__parent_template }, { _id: ec__parent_template }] })
      .paths('ec__version')
      .skipAcl()
      .grant(4)
      .map(v => Object.assign(v, TemplateVersionManager.getComponents(v.ec__version)))
      .sort((a, b) => a.major === b.major ? (b.minor || 0) - (a.minor || 0) : b.major - a.major)
      .filter(v => v.major === currentMajor)[0].minor

    return `${currentMajor}.${(maxMinor || 0) + 1}`

  }

  static getNextMajorVersion(currentDoc) {

    const ec__parent_template = (currentDoc.ec__parent_template && currentDoc.ec__parent_template._id) || currentDoc._id

    const maxMajor = ec__document_templates.find({ $or: [{ ec__parent_template }, { _id: ec__parent_template }] })
      .paths('ec__version')
      .skipAcl()
      .grant(4)
      .map(v => Object.assign(v, TemplateVersionManager.getComponents(v.ec__version)))
      .sort((a, b) => a.major === b.major ? (b.minor || 0) - (a.minor || 0) : b.major - a.major)[0].major

    return `${(maxMajor || 0) + 1}`

  }

  static validate(version) {
    return TemplateVersionManager.versionRegex.test(version)
  }

  static getComponents(version) {
    const [maj, min] = version.split('.')

    return { major: Number(maj), minor: Number(min) }
  }

}

module.exports = { TemplateCloner, TemplateVersionManager }