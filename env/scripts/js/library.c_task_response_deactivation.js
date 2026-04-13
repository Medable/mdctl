import { route, log, transform, trigger } from 'decorators'
import cache from 'cache'
import { debug, error } from 'logger'
import faults from 'c_fault_lib'
import nucUtils from 'c_nucleus_utils'
import _ from 'underscore'

const { id: { isIdFormat } } = require('util')
const { operations: { find } } = require('runtime')

const { AclManagment: { canEditTaskResponse, canSetTaskResponseStatus }, isSystemUserID } = require('c_nucleus_utils')

const {
  c_task_responses: TaskResponses,
  c_step_responses: StepResponses,
  c_queries: Queries,
  history: History,
  c_sites: Sites,
  accounts: Accounts,
  bulk: BulkOperations
} = org.objects

@transform('c_deactivation_transform')
class DeactivationTransform {

  each({ object, _id }, { reasonForChange }) {

    const scriptAsSystem = (callback) => {
      const config = { principal: { skipAcl: true, grant: consts.accessLevels.update } }
      return script.as('c_system_user', config, callback)
    }

    const clearStepResponse = (_id) => {

      const unsetStatement = {
        $unset: {
          c_value: 1,
          c_skipped: 1
        },
        $set: {
          audit: {
            message: reasonForChange
          }
        }
      }

      return scriptAsSystem(() => StepResponses
        .updateOne({ _id }, unsetStatement)
        .execute())
    }

    const cancelQuery = (_id) => {

      const setStatement = {
        $set: {
          c_status: 'cancelled',
          audit: { message: reasonForChange }
        }
      }

      return scriptAsSystem(() => Queries
        .updateOne({ _id }, setStatement)
        .execute())
    }

    if (object === 'c_step_response') {

      return clearStepResponse(_id)

    } else if (object === 'c_query') {

      return cancelQuery(_id)

    }

  }

}
class TaskResponseDeactivation {

  // extracted from Bulk Operation Constants on Cortex
  static states = {
    queued: 'queued',
    starting: 'starting',
    started: 'started',
    stopping: 'stopping',
    stopped: 'stopped',

    // custom state to signal the completion of a bulk op
    completed: 'completed',
    // custom state to signal that the dectivation process failed to clean queries and task responses
    incomplete: 'incomplete'
  }

  static deactivationKeyPrefix = 'c_deactivating_'

  static deactivationMessagePrefix = 'c_deactivating_message_'

  static deactivateTaskResponse(taskResponseId, reasonForChange) {

    const deactivateKey = this.getDeactivationKey(taskResponseId)

    const stepResponsesCursor = this.getStepResponsesCursor(taskResponseId)

    const queriesCursor = this.getQueriesCursor(taskResponseId)

    const operation = BulkOperations()
      .add(stepResponsesCursor, { wrap: false })
      .add(queriesCursor, { wrap: false })
      .transform({
        autoPrefix: true,
        memo: {
          reasonForChange
        },
        script: 'c_deactivation_transform'
      })
      .async({
        lock: {
          name: deactivateKey,
          restart: false
        }
      })
      .next()

    this.setDeactivationCache(taskResponseId, operation)

    return operation

  }

  static getDeactivationKey(taskResponseId) {
    return this.deactivationKeyPrefix + taskResponseId
  }

  static setDeactivationCache(taskResponseId, operation) {
    const cacheKey = this.getDeactivationKey(taskResponseId)

    const timeout = 600

    return cache.set(cacheKey, operation, timeout)
  }

  static getDeactivationCache(taskResponseId) {
    const cacheKey = this.getDeactivationKey(taskResponseId)
    return cache.get(cacheKey)
  }

  static getDeactivationMessageKey(taskResponseId) {
    return this.deactivationMessagePrefix + taskResponseId
  }

  static setDeactivationMessageCache(taskResponseId, message, ttlInSeconds) {
    const messageKey = this.getDeactivationMessageKey(taskResponseId)

    const defaultTtlInSeconds = 600

    const timeout = ttlInSeconds || defaultTtlInSeconds

    return cache.set(messageKey, message, timeout)
  }

  static getDeactivationMessageCache(taskResponseId) {
    const messageKey = this.getDeactivationMessageKey(taskResponseId)

    return cache.get(messageKey)
  }

  static findRunningOperation(taskResponseId) {

    const cachedOp = this.getDeactivationCache(taskResponseId)

    if (!cachedOp) return

    const { uuid } = cachedOp

    if (!uuid) return

    const ops = find({ uuid })

    const [opFound] = ops

    return opFound
  }

  static getQueriesCursor(taskResponseId) {
    return Queries
      .find({
        c_task_response: taskResponseId,
        c_status: { $in: ['open', 'responded'] }
      })
      .paths('object')
      .skipAcl()
      .grant('read')
  }

  static getStepResponsesCursor(taskResponseId) {
    return StepResponses
      .find({ c_task_response: taskResponseId })
      .paths('object', 'c_value')
      .skipAcl()
      .grant('read')
  }

  static getMessageFromHistory(taskResponseId) {

    let auditMessage

    const [cancelledQuery] = Queries
      .find({ c_status: 'cancelled', c_task_response: taskResponseId })
      .paths('_id')
      .limit(1)
      .skipAcl()
      .grant('read')
      .toArray()

    const [cleanedStepResponse] = StepResponses
      .find({ c_task_response: taskResponseId })
      .paths('_id', 'c_value')
      .skipAcl()
      .grant('read')
      .toArray()
      // matching by c_value is not possible at $match stage
      .filter(stepResponse => {
        if (_.has(stepResponse, 'c_value')) {
          const value = stepResponse.c_value
          return _.isArray(value) ? !value.length : (_.isNull(value) || _.isUndefined(value))
        } else {
          return true
        }
      })

    const deactivatedEntity = cancelledQuery || cleanedStepResponse

    if (deactivatedEntity) {

      // we need to sort by id to get the latest change after TR got deactivated
      const aggPipeline = [
        {
          $match: {
            'context._id': deactivatedEntity._id
          }
        },
        {
          $sort: { _id: -1 }
        },
        {
          $limit: 1
        }
      ]

      const [history] = History
        .aggregate(aggPipeline)
        .skipAcl()
        .grant(8)
        .toArray()

      auditMessage = history && history.message
    }

    return auditMessage
  }

  static isIncomplete(taskResponseId) {

    const queriesCount = this.getQueriesCursor(taskResponseId)
      .count()

    const stepResponsesCount = this.getStepResponsesCursor(taskResponseId)
      .toArray()
      // matching by c_value is not possible at $match stage
      .filter(stepResponse => {
        if (_.has(stepResponse, 'c_value')) {
          const value = stepResponse.c_value
          return _.isArray(value) ? value.length : !(_.isNull(value) || _.isUndefined(value))
        } else {
          return false
        }
      })
      .length

    const isIncomplete = !!(queriesCount || stepResponsesCount)

    return isIncomplete
  }

  static getTaskResponse(taskResponseId, script) {

    let [taskResponse] = TaskResponses
      .find({ _id: taskResponseId })
      .paths('c_site')
      .skipAcl()
      .grant('read')
      .toArray()

    if (!taskResponse) return

    // try to get the site via site if not get it via accounts
    if (!nucUtils.isNewSiteUser(script.principal.roles)) {
      // replace with the full object as complete as the current user can read it
      const prefix = `${taskResponse.c_site._id}/c_task_responses/${taskResponseId}`
      taskResponse = Sites
        .find()
        .pathPrefix(prefix)
        .toArray()[0]
    } else {
      // replace with the full object as complete as the current user can read it
      const prefix = `${script.principal._id}/c_sites/${taskResponse.c_site._id}/c_task_responses/${taskResponseId}`
      taskResponse = Accounts
        .find()
        .pathPrefix(prefix)
        .toArray()[0]
      if (!taskResponse) {
        faults.throw('cortex.accessDenied.instanceRead')
      }
    }

    return taskResponse
  }

  /**
   * @openapi
   * /c_task_responses/{taskResponseId}/deactivate:
   *  post:
   *    description:  "Deactivate task response"
   *    parameters:
   *      - name: taskResponseId
   *        in: path
   *        required: true
   *        description: Task response ID
   *    requestBody:
   *      description:
   *      required: true
   *      content:
   *        application/json:
   *          schema:
   *            type: object
   *            properties:
   *              audit:
   *                type: object
   *                properties:
   *                  message:
   *                    type: string
   *
   *    responses:
   *      '200':
   *        description: returns state and operations
   */
  @log({ traceError: true })
  @route({
    weight: 1,
    method: 'POST',
    authValidation: 'all',
    name: 'c_deactivate_task_response',
    path: 'c_task_responses/:taskResponseId/deactivate'
  })
  static post({ req, body }) {

    let operation, state

    const { params: { taskResponseId } } = req

    const { audit } = body()

    const existingMessage = this.getDeactivationMessageCache(taskResponseId)

    let auditMessage = existingMessage || (audit && audit.message)

    if (taskResponseId && !isIdFormat(taskResponseId)) {
      faults.throw('axon.invalidArgument.invalidObjectId')
    }

    const taskResponse = this.getTaskResponse(taskResponseId, script)

    if (!taskResponse) {
      faults.throw('axon.notFound.instanceNotFound')
    }

    const deactivationKey = this.getDeactivationKey(taskResponseId)

    // if task response status was already changed to Inactive
    if (taskResponse.c_status === 'Inactive') {

      operation = this.findRunningOperation(taskResponseId)

      const isIncomplete = this.isIncomplete(taskResponseId)

      if (isIncomplete && !operation) {

        // We need to enforce that the auditMessage is
        // the same across all step responses and queries
        // for that reason we ignore the provided message and
        // we use the one that was already applied to the
        // queries and step responses
        const auditMessageFromHistory = this.getMessageFromHistory(taskResponseId)

        // as no audit message was previously set, the operation could've
        // failed before cancelling the first query or step response
        // therefore using the POST body is fine
        auditMessage = auditMessageFromHistory || auditMessage

        if (!auditMessage) {

          faults.throw('axon.invalidArgument.reasonForChangeRequired')
        }

        operation = this.deactivateTaskResponse(taskResponseId, auditMessage)

      } else if (!isIncomplete) {

        state = this.states.completed
      }

    } else {

      if (!auditMessage) {

        faults.throw('axon.invalidArgument.reasonForChangeRequired')
      }

      this.setDeactivationMessageCache(taskResponseId, auditMessage)
      // try to update via site if not do it via accounts in case of new site user
      if (!nucUtils.isNewSiteUser(script.principal.roles)) {
        Sites
          .updateOne({ _id: taskResponse.c_site._id })
          .pathUpdate('c_task_responses', [{ _id: taskResponseId, c_status: 'Inactive' }])
      } else {
        Accounts.updateOne({ _id: script.principal._id })
          .pathUpdate(`c_sites/${taskResponse.c_site._id}/c_task_responses`, [{ _id: taskResponseId, c_status: 'Inactive' }])
      }

      operation = this.findRunningOperation(taskResponseId)
    }

    state = state || (operation && operation.state) || this.states.queued

    let response = { state }

    if (operation) {
      response = { ...response, operation }
    }

    return response

  }

  /**
   * @openapi
   * /c_task_responses/{taskResponseId}/status:
   *  get:
   *    description: 'Check deactivation of task response'
   *    parameters:
   *      - name: taskResponseId
   *        in: path
   *        required: true
   *
   *    responses:
   *      '200':
   *        description: returns state and operation
   */
  @log({ traceError: true })
  @route({
    weight: 1,
    method: 'GET',
    name: 'c_check_deactivation',
    path: 'c_task_responses/:taskResponseId/status'
  })
  static get({ req }) {

    const { params: { taskResponseId } } = req

    if (taskResponseId && !isIdFormat(taskResponseId)) {
      faults.throw('axon.invalidArgument.invalidObjectId')
    }

    const taskResponse = this.getTaskResponse(taskResponseId, script)

    if (!taskResponse) {
      faults.throw('axon.notFound.instanceNotFound')
    }

    const operation = this.findRunningOperation(taskResponseId)

    const isIncomplete = this.isIncomplete(taskResponseId)

    const operationState = (operation && operation.state)

    const completionState = isIncomplete ? this.states.incomplete : this.states.completed

    const state = operationState || completionState

    let response = { state }

    if (operation) {
      response = { ...response, operation }
    }

    return response
  }

  // former trigger.c_nucleus_tr_before_update
  @log({ traceError: true })
  @trigger('update.before', {
    name: 'c_nucleus_tr_before_update',
    principal: 'c_system_user',
    object: 'c_task_response',
    weight: 1,
    if: {
      $and: [
        {
          $gte: [{
            $indexOfArray: [
              '$modified',
              'c_status'
            ]
          }, 0]
        },
        {
          $eq: [
            '$current.c_status',
            'Inactive'
          ]
        },
        {
          $ne: ['$previous.c_status', '$current.c_status']
        }
      ]
    },
    rootDocument: 'runtime'
  })
  static updateBefore({ new: { _id: taskResponseId }, body }) {

    if (!canEditTaskResponse() || !canSetTaskResponseStatus()) return

    const taskResponse = TaskResponses
      .find({ _id: taskResponseId })
      .skipAcl()
      .grant('read')
      .paths('c_account', 'creator')
      .passive()
      .next()

    const hasNoCreator = !taskResponse.creator

    const creatorIsSystemUser = isSystemUserID(taskResponse.creator._id)

    const accountAndCreatorMatch = (taskResponse.c_account && taskResponse.c_account._id.equals(taskResponse.creator._id))

    if (hasNoCreator || creatorIsSystemUser || accountAndCreatorMatch) {

      faults.throw('axon.accessDenied.noEditPatientTasks')
    }

    const deactivationReason = this.getDeactivationMessageCache(taskResponseId)

    const { audit } = body()

    const bodyAuditMessage = audit && audit.message

    const auditMessage = deactivationReason || bodyAuditMessage

    if (!auditMessage) {

      faults.throw('axon.invalidArgument.reasonForChangeRequired')
    }

    if (!deactivationReason) {

      this.setDeactivationMessageCache(taskResponseId, auditMessage)
    }

  }

  // former trigger.c_nucleus_tr_deactivation
  @log({ traceError: true })
  @trigger('update.after', {
    name: 'c_nucleus_tr_deactivation',
    principal: 'c_system_user',
    object: 'c_task_response',
    weight: 1,
    if: {
      $and: [
        {
          $gte: [{
            $indexOfArray: [
              '$modified',
              'c_status'
            ]
          }, 0]
        },
        {
          $eq: [
            '$current.c_status',
            'Inactive'
          ]
        },
        {
          $ne: ['$previous.c_status', '$current.c_status']
        },
        {
          $ne: [{ $cache: { $concat: ['c_deactivating_message_', '$current._id'] } }, null]
        }
      ]
    },
    rootDocument: 'runtime'
  })
  static updateAfter({ new: { _id: taskResponseId } }) {

    const auditMessage = this.getDeactivationMessageCache(taskResponseId)

    // if (!auditMessage) return

    return this.deactivateTaskResponse(taskResponseId, auditMessage)
  }

}

module.exports = {
  DeactivationTransform,
  TaskResponseDeactivation
}