/* eslint-disable no-prototype-builtins */
import {
  route,
  transform,
  as,
  log
} from 'decorators'
import _ from 'lodash'
import logger from 'logger'
import util from 'util'
import request from 'request'
import i18n from 'i18n'

import faults from 'c_fault_lib'
const { id: { equalIds } } = util

const {
  c_queries,
  c_public_users,
  history
} = org.objects

// these are the roles permitted to see task and public user audit history
const historyViewRoles = [
  consts.roles.administrator,
  consts.roles.c_site_user,
  consts.roles.c_data_manager,
  consts.roles.c_site_investigator,
  consts.roles.c_site_monitor,
  consts.roles.c_data_reviewer,
  consts.roles.c_data_export,
  consts.roles.c_study_participant,
  consts.roles.c_principal_data_manager
]

const newSiteHistoryViewRoles = [
  consts.roles.c_axon_site_user,
  consts.roles.c_axon_site_monitor,
  consts.roles.c_axon_site_auditor,
  consts.roles.c_axon_site_investigator
]

// extracts an expanded reference at the end of a path from an object while
// ignoring intermediate objects.  Always returns an array.
function extractReference(object, path) {
  const segments = path.split('.')
  let result = Array.isArray(object) ? object : [object]

  while (segments.length) {
    const segment = segments.shift()
    result = result
      .map(r => r[segment].data ? r[segment].data : r[segment])
      .reduce((memo, r) => ([...memo, ...(Array.isArray(r) ? r : [r])]), [])
  }

  return result
}
// Extracts multiple expanded references from an object and returns them in a
// single flat array.
function extractReferences(object, references) {
  return references.reduce((memo, reference) => {
    return [...memo, ...extractReference(object, reference)]
  }, [])
}

function getReasonToChangeTitle(locale) {
  const tr = {
    'bg-BG': 'Причина за промяна',
    'cs-CZ': 'Důvod ke změně',
    'da-DK': 'Årsag til ændring',
    'de-CH': 'Änderungsgrund',
    'de-DE': 'Ursache der Änderung',
    'en-AU': 'Reason For Change',
    'en-GB': 'Reason For Change',
    'en-NZ': 'Reason For Change',
    en: 'Reason For Change',
    'es-419': 'Motivo del cambio',
    'es-ES': 'Motivo del cambio',
    'es-MX': 'Motivo del cambio',
    'es-US': 'Motivo del cambio',
    es: 'Motivo del cambio',
    'fr-BE': 'Raison du changement',
    'fr-CA': 'Raison du changement',
    'fr-CH': 'Raison du changement',
    'fr-FR': 'Raison de la modification',
    fr: 'Raison de la modification ',
    'hu-HU': 'Módosítás indoka',
    'it-IT': 'Motivo del Cambiamento',
    'ja-JP': '変更の理由',
    'ka-GE': 'ცვლილების მიზეზი',
    'ko-KR': '변경 사유',
    'lt-LT': 'Pakeitimo priežastis',
    'ms-MY': 'Sebab Perubahan',
    'nl-BE': 'Reden voor wijziging',
    'nl-NL': 'Reden van wijziging',
    'pl-PL': 'Powód zmiany',
    'pt-BR': 'Justificativa para Alteração',
    'ro-RO': 'Motivul schimbării',
    'ru-RU': 'Причина изменений',
    'ru-UA': 'Причина изменения',
    'sk-SK': 'Príčina zmeny',
    'sv-SE': 'Orsak till ändring',
    'ta-IN': 'மாற்றுவதற்கான காரணம்',
    'th-TH': 'เหตุผลในการเปลี่ยน',
    'tr-TR': 'Değişimin Sebebi',
    'uk-UA': 'Причина зміни',
    'zh-CN': '变更的原因',
    'zh-TW': '變更的原因'
  }

  return tr[locale] || 'Reason For Change'
}

function getDeactivationReason(locale, reasonCode) {
  return i18n.translate(`siteapp-app:deactivationReasonCodes.${reasonCode}`, { locale }) || reasonCode
}

/**
 * Removes unnecessary fields from an object.  These are fields which will
 * not be included in enhanced history entries, such as a study's resources or
 * a webview step's html contents.
 *
 * We use a property blacklist instead of a whitelist because the overall design
 * of audit history is to allow fields and related objects to be added with
 * minimal changes.
 */
function removeUnnecessaryProperties(object) {
  if (object.object === 'c_study') {
    delete object.c_resources
  } else if (object.object === 'c_step' && object.c_html_content) {
    delete object.c_html_content
  }
  return object
}

/**
 * Expands References from objectName and collects ids + object instances.
 *
 * Returns an array of context ids that can be used to fetch history objects,
 * and returns a map of related objects that can be used for enhancing those
 * history objects.
 */
function flatExpansion(objectName, _id, contextReferences, additionalReferences) {
  const referencesToExpand = [...contextReferences, ...additionalReferences]

  const result = org.objects[objectName]
          .readOne({ _id })
          .expand(...referencesToExpand)
          .execute(),
        contextObjects = extractReferences(result, contextReferences),
        additionalObjects = extractReferences(result, additionalReferences),
        contextIds = [_id, ...contextObjects.map(o => o._id)],
        relatedObjects = [...contextObjects, ...additionalObjects]
          .map(removeUnnecessaryProperties)
          .reduce((memo, o) => {
            memo[o._id] = o
            return memo
          }, {})

  return { contextIds, relatedObjects }
}

/**
 * Given a list of operations that were applied to produce a value of `endResult`,
 * return the value before the operations were applied.  This is done by
 * applying the inverse operations to the endResult in reverse order.
 *
 * example in pseudocode:
 *.    operations: `[{pull: '1', index: 0}, {push: '2', index 0}]`
 *     endResult: ['2']
 *
 *     Step 1: apply inverse of `{push: '2', index: 0}`, aka "remove value at index 0"
 *     Result: []
 *     Step 2: apply inverse of `{pull: '1', index: 0}`, aka "insert value `1` at index 0"
 *     Result: ['1']
 *
 * Expectations:
 * * all ops must have the same path.
 * * it's invalid for ops to use both push/pull and set/remove.
 */
function reverseOperations(operations, endResult) {
  return operations.reverse()
    .reduce((result, op) => {
      if (op.type === 4) { // pull becomes push
        if (typeof result === 'undefined') {
          result = []
        }
        result.splice(op.index, 0, op.value)
      } else if (op.type === 3) { // push becomes pull
        result.splice(op.index, 1)
      } else if (op.type === 2 || op.type === 1) { // remove or set
        result = op.value
      }
      return result
    }, endResult)
}

/**
* Assuming an object has a site parameter, throws an error if the user does not have the correct role on that site
*/
function checkSitePermission(_id, objectName) {
  const obj = script.as(script.principal, { safe: false, principal: { skipAcl: true, grant: 'read' } }, () => {
    return org.objects[objectName].find({ _id })
      .expand('c_site')
      .next()
  })
  const accessRoles = (obj.c_site && obj.c_site.accessRoles.map(v => v.toString())) || []

  // check site acutally belongs to user if user has new  site account level role
  if (newSiteHistoryViewRoles.some(v => accessRoles.includes(v.toString()))) {
    const { c_site_access_list } = org.objects.accounts
      .find({ _id: script.principal._id })
      .expand('c_site_access_list')
      .next()
    const siteAccessList = (c_site_access_list && c_site_access_list.map(v => v.toString())) || []
    if (!(obj.c_site && siteAccessList.includes(obj.c_site._id.toString()))) {
      faults.throw('cortex.accessDenied.instanceRead')
    }
  } else if (!historyViewRoles.some(v => accessRoles.includes(v.toString()))) {
    faults.throw('cortex.accessDenied.instanceRead')
  }
}

/**
 * Assumes objectName has a `c_study` property, expands that to fetch study
 * configuration and returns it.
 */
function loadStudy(_id, objectName) {
  const study = org.objects[objectName]
    .readOne(_id)
    .skipAcl()
    .grant(consts.accessLevels.read)
    .expand('c_study.c_anchor_date_templates', 'c_study.c_patient_flags')
    .execute()
    .c_study
  return removeUnnecessaryProperties(study)
}

/**
 * Utility for updating history entries.  Exported separately for testing.
 */
class HistoryUtility {

  constructor() {
    this.schemaCache = {}
    this.propertyLabelCache = {}
    this.updaterCache = {}
  }

  // Read property at a given path in a document.
  // Supports cortex array paths by id.  Array paths without unique _id will
  // most likely fail.
  readPath(document, path) {
    if (path.indexOf('.') === -1) {
      return document[path]
    }

    const segments = path.split('.')
    let result = document

    while (segments.length) {
      const segment = segments.shift()
      if (result[segment] !== undefined) {
        result = result[segment]
        continue
      }
      if (Array.isArray(result) && result.some(i => equalIds(i._id, segment))) {
        result = result.find(i => equalIds(i._id, segment))
        continue
      }
      logger.error(`History: Could not interpret path ${path} in document ${document._id} of type ${document.object}`)
      return path // unhandled!
    }
    return result
  }

  // Returns object schema, cached for performance.
  getSchema(object) {
    if (!this.schemaCache[object]) {
      this.schemaCache[object] = org.objects.objects.readOne({ name: object })
        .execute()
    }
    return this.schemaCache[object]
  }

  // Returns object name from schema.
  localizedObjectName(object) {
    return this.getSchema(object).label
  }

  // Searches schema for matching object property label and returns it.
  // If it can't find a label, returns the path instead.  Results are cached
  // for performance.
  //
  // @param objectName - the cortex object name
  // @param objectType - a valid object type of the object
  // @param path - property path to retrieve label for.
  localizedObjectPropertyLabel(objectName, objectType, path) {
    const objectKey = `${objectName}:${objectType}`
    if (!this.propertyLabelCache[objectKey]) {
      this.propertyLabelCache[objectKey] = {}
    } else if (this.propertyLabelCache[objectKey][path]) {
      return this.propertyLabelCache[objectKey][path]
    }

    const objectSchema = this.getSchema(objectName),
          objectTypeSchema = objectSchema.objectTypes.find(ot => ot.name === objectType)

    const segments = path.split('.')

    let properties = [
      ...objectSchema.properties,
      ...(objectTypeSchema ? objectTypeSchema.properties : [])
    ]

    let property

    while (segments.length) {
      const segment = segments.shift()
      property = properties.find(prop => prop.name === segment)
      if (!property) {
        continue // segment is an id for an document[], skip it.
      }
      if (!property.properties) {
        break // remaining path not in schema, e.g. Geo's `.coordinations`
      }
      properties = property.properties
    }

    if (property) {
      this.propertyLabelCache[objectKey][path] = property.label
      return property.label
    }

    return path
  }

  // Extracts operations from a history entry, and reduces multiple operations
  // impacting the same property into a single change.
  transformHistoryChanges(historyEntry) {
    const objectName = historyEntry.document.object,
          objectType = historyEntry.document.type,
          opsByPath = historyEntry.ops.reduce((opsByPath, op) => {
            if (!opsByPath[op.path]) {
              opsByPath[op.path] = []
            }
            opsByPath[op.path].push(op)
            return opsByPath
          }, {})

    return Object.values(opsByPath)
      .map(operations => {
        const path = operations[0].path,
              label = this.localizedObjectPropertyLabel(objectName, objectType, path),
              newValue = this.readPath(historyEntry.document, path),
              oldValue = reverseOperations(operations, _.cloneDeep(newValue))

        return { path, label, newValue, oldValue }
      })
      .filter(operation => operation.newValue !== operation.oldValue)
  }

  // Converts a Cortex History Entry into a more descriptive format.
  transformHistoryEntry(history) {
    const operationType = history.context.sequence === 0 ? 'create' : 'update'
    return {
      _id: history._id,
      object: 'axon__history',
      object_id: history.context._id,
      type: history.context.object,
      label: this.localizedObjectName(history.context.object),
      operation: operationType,
      updated: history.document.updated,
      updater: history.document.updater,
      changes: this.transformHistoryChanges(history),
      related_info: [],
      additional_information: []
    }
  }

  // Helper for getting service accounts.
  getServiceAccount(id) {
    if (!this.serviceAccounts) {
      this.serviceAccounts = org.objects.org.readOne()
        .execute().serviceAccounts
    }
    return this.serviceAccounts.find(s => equalIds(s._id, id))
  }

  // Return the generic principal name for an id.
  getGenericPrincipal(id) {
    for (const [k, v] of Object.entries(consts.principals)) {
      if (equalIds(v, id)) {
        return k
      }
    }
  }

  // Returns the display name for a given updater.
  // Results are cached for performance.
  getUpdaterName(updaterId) {
    if (!this.updaterCache[updaterId]) {
      this.updaterCache[updaterId] = this.buildUpdaterName(updaterId)
    }
    return this.updaterCache[updaterId]
  }

  // Builds updater name, hitting the database every time.
  buildUpdaterName(updaterId) {
    const account = org.objects.accounts.readOne({ _id: updaterId })
      .throwNotFound(false)
      .skipAcl()
      .grant(consts.accessLevels.read)
      .execute()

    if (!account) {
      const serviceAccount = this.getServiceAccount(updaterId)

      if (serviceAccount) {
        return serviceAccount.label
      }

      const genericPrincipal = this.getGenericPrincipal(updaterId)
      if (genericPrincipal) {
        return genericPrincipal
      }

      return updaterId
    }

    if (account.roles.some(r => equalIds(r, consts.roles.c_study_participant))) {
      const publicUser = org.objects.c_public_user.find({ c_account: account._id })
        .skipAcl()
        .grant('read')
        .toArray()
      return (publicUser.length && publicUser[0].c_number) || this.localizedObjectName('c_public_user')
    }

    if (account.c_public_identifier) {
      return account.c_public_identifier
    }

    return `${account.name.first} ${account.name.last}`
  }

}

/**
 * History Transform: Expects to get all possible related objects in memo.
 */
@transform('c_axon_history_transform')
class TransformTaskResponseHistory {

  before(memo) {
    this.study = memo.study
    this.relatedObjects = memo.relatedObjects
    this.util = new HistoryUtility()
  }

  // Look up display name for the updater and attach it to the record.
  enhanceUpdater(updater) {
    updater.name = this.util.getUpdaterName(updater._id)
    return updater
  }

  // Convenience method, returns a localized label-value display element for a
  // property of a related object.  This can be added directly to a
  // historyObjects' 'additional_information' or 'related_information'.
  // Returns undefined if it can't find the object or property.
  getRelatedObjectPropertyForDisplay(id, property) {
    const object = this.relatedObjects[id]
    if (!object || !object.hasOwnProperty(property) || !object.object) {
      return
    }
    return {
      type: 'value',
      label: this.util.localizedObjectPropertyLabel(object.object, object.type, property),
      value: object[property]
    }
  }

  @log({ traceError: true })
  each(rawHistory) {
    const historyObject = this.util.transformHistoryEntry(rawHistory),
          enhanceMethodName = `enhance_${rawHistory.context.object}`

    if (historyObject.changes.length === 0) {
      return // filter out entries with no changes.
    }

    historyObject.updater = this.enhanceUpdater(historyObject.updater)
    if (this[enhanceMethodName]) {
      this[enhanceMethodName](historyObject, rawHistory, this.relatedObjects[historyObject.object_id])
    }

    return historyObject
  }

  // Add additional information to history entries related to a query.
  enhance_c_query(historyObject, rawHistory, query) {
    [
      'c_description',
      'c_number',
      'c_response'
    ].map((p) => this.getRelatedObjectPropertyForDisplay(historyObject.object_id, p))
      .filter(p => !!p)
      .forEach(p => historyObject.additional_information.push(p))

    if (query.c_step_response) {
      const stepResponse = this.relatedObjects[query.c_step_response]

      if (stepResponse) {
        this.enhance_c_step_response(historyObject, rawHistory, stepResponse)
      }
    }
  }

  // Add additional information to history entries related to a step response.
  enhance_c_step_response(historyObject, rawHistory, stepResponse) {
    const additionalFields = [
      'c_text',
      'c_question',
      'c_description'
    ]
      .map((p) => this.getRelatedObjectPropertyForDisplay(stepResponse.c_step._id, p))
      .filter(p => !!p)

    if (additionalFields.length) {
      historyObject.related_info.push({
        type: 'header',
        label: this.util.localizedObjectName('c_step')
      })
      additionalFields.forEach(p => historyObject.related_info.push(p))
    }

    if (rawHistory.message) {
      historyObject.additional_information.push({
        type: 'header',
        label: getReasonToChangeTitle(request.locale)
      })
      historyObject.additional_information.push({
        type: 'text',
        label: rawHistory.message
      })
    }
  }

  // Localize and handle special property labels for history entries related to
  // a c_public_user query.
  enhance_c_public_user(historyObject, rawHistory, publicUser) {
    // Localize status values
    const statusChange = historyObject.changes.find(c => c.path === 'c_status')
    if (statusChange) {
      const newValue = this.study.c_subject_status_list
              .find(s => s.c_status_value === statusChange.newValue),
            oldValue = this.study.c_subject_status_list
              .find(s => s.c_status_value === statusChange.oldValue)

      if (newValue) {
        statusChange.newValue = newValue.c_status_value
      }
      if (oldValue) {
        statusChange.oldValue = oldValue.c_status_value
      }

      if (rawHistory.message && rawHistory.document.c_status === 'Deactivated') {
        historyObject.additional_information.push({
          type: 'header',
          label: getReasonToChangeTitle(request.locale)
        })
        historyObject.additional_information.push({
          type: 'text',
          label: getDeactivationReason(request.locale, rawHistory.message)
        })
      }
    }

    historyObject.changes.filter(c => c.path.startsWith('c_set_dates'))
      .forEach(anchorDateChange => {
        const id = anchorDateChange.path.split('.')[1],
              setDate = publicUser.c_set_dates.find(setDate => equalIds(setDate._id, id)),
              template = this.study.c_anchor_date_templates.data.find(t => equalIds(t._id, setDate.c_template._id))

        anchorDateChange.label = template.c_identifier
      })

    historyObject.changes.filter(c => c.path.startsWith('c_set_flags'))
      .forEach(patientFlagChange => {
        const id = patientFlagChange.path.split('.')[1],
              setFlag = publicUser.c_set_flags.find(({ _id: flagId }) => flagId.equals(id))

        patientFlagChange.label = setFlag.c_identifier
      })
  }

}

class HistoryRoutes {

  /**
   * @openapi
   * /history/c_task_responses/{taskResponseId}:
   *  get:
   *    description: 'get task response history'
   *    parameters:
   *      - name: taskResponseId
   *        in: path
   *        required: true
   *        description:
   *        schema:
   *          type: string
   *
   *    responses:
   *      '200':
   *        description: A list of history entries
   *        example:
   *
   * @brief      Fetch history records for a given task response
   *
   *   @route      routes/history/c_task_responses/:taskResponseId
   *
   *   @response   A list of history entries, example:
   *
   *               {
   *                 "_id": "5d6d41234b94ba0100fc3561",
   *                 "additional_information": [
   *                     {
   *                         "label": "Number",
   *                         "type": "value",
   *                         "value": "00005"
   *                     }
   *                 ],
   *                 "changes": [
   *                     {
   *                         "label": "Status",
   *                         "newValue": "responded",
   *                         "oldValue": "responded",
   *                         "path": "c_status"
   *                     }
   *                 ],
   *                 "label": "Query",
   *                 "object_id": "5d35edb952ff8b0100dd06a3",
   *                 "operation": "update",
   *                 "related_info": [],
   *                 "type": "c_query",
   *                 "updated": "2019-09-02T16:19:47.535Z",
   *                 "updater": {
   *                     "_id": "5bf56f93b7dadb0100ea4bc0",
   *                     "object": "account",
   *                     "path": "/accounts/5bf56f93b7dadb0100ea4bc0"
   *                 }
   *               }
   *
   *   (c)2020 Medable, Inc.  All Rights Reserved.
   */
  @route({
    method: 'GET',
    name: 'c_axon_get_task_response_history',
    path: 'history/c_task_responses/:taskResponseId'
  })
  static getTaskResponseHistory({
    req
  }) {
    const taskResponseId = req.params.taskResponseId
    checkSitePermission(taskResponseId, 'c_task_responses')

    return this.historyForTaskResponse(taskResponseId)
  }

  /**
   * @openapi
   * /history/c_public_users/{publicUserId}:
   *  get:
   *    description: 'get participant history'
   *    parameters:
   *      - name: publicUserId
   *        in: path
   *        required: true
   *        description:
   *        schema:
   *          type: string
   *
   *    responses:
   *      '200':
   *        description: A list of history entries
   *        example:
   */
  @route({
    method: 'GET',
    name: 'c_axon_get_participant_history',
    path: 'history/c_public_users/:publicUserId'
  })
  static getParticipantHistory({
    req
  }) {
    logger.info(req)
    const publicUserId = req.params.publicUserId
    checkSitePermission(publicUserId, 'c_public_users')

    return this.historyForPublicUser(publicUserId)
  }

  /**
   * Returns a cursor that returns history objects.
   */
  @as(script.principal, { safe: false, principal: { skipAcl: true, grant: 'read' } })
  static historyForTaskResponse(taskResponseId, raw) {

    const CONTEXT_REFERENCES = ['c_step_responses', 'c_queries', 'c_reviews'],
          ADDITIONAL_REFERENCES = ['c_task', 'c_task.c_steps', 'c_study'],
          study = loadStudy(taskResponseId, 'c_task_response'),
          { contextIds, relatedObjects } = flatExpansion(
            'c_task_response',
            taskResponseId,
            CONTEXT_REFERENCES,
            ADDITIONAL_REFERENCES
          ),
          historyCursor = history.find({
            'context._id': {
              $in: contextIds
            }
          })
            .sort({
              _id: -1
            })
            .skipAcl()
            .grant(8)

    if (raw) {
      return historyCursor
    }

    return historyCursor.transform({
      script: 'c_axon_history_transform',
      memo: {
        relatedObjects,
        study
      }
    })
  }

  /**
   * Returns a cursor that returns history objects.
   */
  @as(script.principal, { safe: false, principal: { skipAcl: true, grant: 'read' } })
  static historyForPublicUser(publicUserId, raw) {
    const study = loadStudy(publicUserId, 'c_public_user'),
          publicUser = c_public_users
            .readOne({ _id: publicUserId })
            .execute(),
          participantQueries = c_queries.find({
            c_subject: publicUserId,
            c_task_response: { $eq: null }
          })
            .toArray(),
          relatedObjects = [publicUser, ...participantQueries].reduce((memo, o) => {
            memo[o._id] = o
            return memo
          }, {}),
          contextIds = Object.keys(relatedObjects),
          historyCursor = history.find({
            'context._id': {
              $in: contextIds
            }
          })
            .sort({
              _id: -1
            })
            .skipAcl()
            .grant(8)

    removeUnnecessaryProperties(relatedObjects)

    if (raw) {
      return historyCursor
    }

    return historyCursor.transform({
      script: 'c_axon_history_transform',
      memo: {
        study,
        relatedObjects
      }
    })
  }

}

module.exports = {
  historyForTaskResponse: HistoryRoutes.historyForTaskResponse,
  historyForPublicUser: HistoryRoutes.historyForPublicUser,
  HistoryUtility
}