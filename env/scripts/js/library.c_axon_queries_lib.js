import { debug } from 'logger'
import { trigger, log } from 'decorators'
import { roles } from 'consts'
import { QueryType, QueryStatus } from 'c_nucleus_query'
import faults from 'c_fault_lib'
import nucUtils from 'c_nucleus_utils'
import { Review } from 'c_dmweb_lib'

const { c_queries: Queries, c_studies: Studies } = org.objects

class QueriesLibrary {

  static findAudit(requestBody) {

    for (const k in requestBody) {

      const propValue = requestBody[k]

      const audit = k === 'audit'
        ? propValue
        : typeof propValue === 'object'
          ? this.findAudit(propValue)
          : undefined

      if (audit) return audit

    }

  }

  static hasRole(rlist, role) {
    return rlist.find(x => x.toString() === roles[role].toString())
  }

  static runAsSystemUser(operationCallback) {
    return script.as('c_system_user', {}, operationCallback)
  }

  // formerly  known  as trigger.c_nucleus_query_statuses
  @log({ traceError: true })
  @trigger('update.before', {
    object: 'c_query',
    weight: 3
  })
  static queryStatuses({
    old: {
      accessRoles: ctxRoles,
      c_type: qType
    },
    new: {
      c_status: newStatus,
      c_search
    },
    modified
  }) {

    const isDM = this.hasRole(ctxRoles, 'Data Manager')

    const isSM = this.hasRole(ctxRoles, 'Site Monitor')

    const isAxonSM = this.hasRole(ctxRoles, 'Axon Site Monitor')

    const isPDM = this.hasRole(ctxRoles, 'Principal Data Manager')

    const isSU = this.hasRole(ctxRoles, 'Site User')

    const isAxonSU = this.hasRole(ctxRoles, 'Axon Site User')

    const isAdmin = this.hasRole(ctxRoles, 'Administrator')

    const isAllowedRole = !!(isDM || isSM || isAxonSM || isPDM || isSU || isAxonSU || isAdmin)

    if (!isAllowedRole) {

      throw Fault.create({ errCode: 'cortex.accessDenied.instanceUpdate' })

    }

    // SU covers SU and SI
    if (isSU || isAxonSU) {

      const modifiedKeys = modified.filter(key => key.startsWith('c_'))

      if (modifiedKeys.length > 1 || modifiedKeys[0] !== 'c_response') {

        throw Fault.create({ errCode: 'cortex.accessDenied.instanceUpdate' })

      }
    }

    if (!isAdmin && !newStatus && !c_search && qType === QueryType.System) {

      faults.throw('axon.accessDenied.cannotEditQueryMessages')

    }

  }

  // formerly known as c_axon_hybrid_query_close_reason
  @log({ traceError: true })
  @trigger('update.before', {
    object: 'c_query',
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
          $in: ['$current.c_status', { $array: ['closed', 'closed:requery'] }]
        }
      ]
    },
    rootDocument: 'runtime'
  })
  static queryCloseReason({ context, body, new: { c_status: newStatus }, old: { c_status: oldStatus } }) {

    if (newStatus === QueryStatus.ClosedRequery && oldStatus !== QueryStatus.Responded) {
      faults.throw('axon.invalidArgument.queryStatusToClosedRequery')
    }

    const audit = this.findAudit(body())

    if (audit && audit.message) {

      context.update('c_closing_reason', audit.message, { grant: 6 })

    }

    const today = new Date()
      .toISOString()

    context.update('c_manually_closed', true, { grant: 6 })

    context.update('c_closed_by', script.principal._id, { grant: 6 })

    context.update('c_closed_datetime', today, { grant: 6 })
  }

  @log({ traceError: true })
  @trigger('update.before', {
    object: 'c_query',
    weight: 1,
    if: {
      $and: [
        {
          $gte: [{
            $indexOfArray: [
              '$modified',
              'c_response'
            ]
          }, 0]
        },
        {
          $in: ['$current.c_status', { $array: ['open'] }]
        }
      ]
    },
    rootDocument: 'runtime'
  })
  static queryResponse({ context }) {

    const today = new Date()
      .toISOString()

    context.update('c_status', 'responded', { grant: 6 })

    context.update('c_responded_by', script.principal._id, { grant: 6 })

    context.update('c_responded_datetime', today, { grant: 6 })

  }

  @log({ traceError: true })
  @trigger('update.after', {
    object: 'c_query',
    inline: true,
    weight: 1,
    if: {
      $eq: [{
        $indexOfArray: [
          '$modified',
          'c_search'
        ]
      }, -1]
    },
    rootDocument: 'runtime'
  })
  static querySearchTerms({ context }) {

    const searchTerms = nucUtils.updateQuerySearchTerms(context)

    this.runAsSystemUser(() => {

      Queries
        .updateOne({ _id: context._id }, { $set: { c_search: searchTerms } })
        .execute()

    })

  }

  // formerly known as c_nucleus_query_update_task_bridge
  @log({ traceError: true })
  @trigger('update.after', {
    object: 'c_query',
    inline: true,
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
          $ne: [
            '$previous.c_task_response',
            null
          ]
        },
        {
          $eq: ['$previous.c_type', 'manual']
        },
        {
          $ne: ['$previous.c_status', '$current.c_status']
        }
      ]
    },
    rootDocument: 'runtime'
  })
  static taskResponseStatus({ old: oldQuery, new: newQuery }) {

    const { c_task_response: taskResponse } = oldQuery

    nucUtils.updateTaskResponseStatus(taskResponse._id)
  }

  // formerly known as trigger.c_nucleus_query_numbering
  @log({ traceError: true })
  @trigger('create.before', {
    object: 'c_query',
    weight: 1,
    if: {
      $and: [
        {
          $eq: [
            '$current.c_number',
            null
          ]
        },
        {
          $ne: [
            '$current.c_study',
            null
          ]
        }
      ]
    },
    rootDocument: 'runtime'
  })
  static queryNumbering({ context, new: newQuery }) {

    const {
      c_study: { _id: studyId }
    } = newQuery

    const study = Studies
      .find({ _id: studyId })
      .paths('c_format_spec_queries')
      .skipAcl()
      .grant(consts.accessLevels.read)
      .next()

    const autoNum = nucUtils.getNextQueryID(study)

    context.update('c_number', autoNum)
  }

  // formerly known as trigger.c_nucleus_query_numbering
  @log({ traceError: true })
  @trigger('create.before', {
    object: 'c_query',
    weight: 2,
    if: {
      $eq: [
        '$current.c_type',
        'system'
      ]
    },
    rootDocument: 'runtime'
  })
  static preventSystemQueryCreation({ context }) {

    const {
      accessRoles
    } = context

    const isAdmin = this.hasRole(accessRoles, 'Administrator')

    if (!isAdmin) {
      faults.throw('axon.accessDenied.systemQueriesAdminsOnly')
    }

  }

  // formerly known as trigger.c_invalidate_reviews_ac_query and c_nucleus_q_create_task_status_bridge
  @log({ traceError: true })
  @trigger('create.after', {
    object: 'c_query',
    inline: true,
    weight: 1,
    if: {
      $ne: [
        {
          $pathTo: ['$current', 'c_task_response']
        },
        null
      ]
    },
    rootDocument: 'runtime'
  })
  static afterQueryCreation({ context: newQuery }) {

    const taskResponseId = newQuery.c_task_response._id

    Review.invalidateReviewsByTaskResponse(taskResponseId)

    nucUtils.updateTaskResponseStatus(taskResponseId)

  }

  @log({ traceError: true })
  @trigger('create.after', {
    object: 'c_query',
    inline: true,
    weight: 1
  })
  static setSearchTerms({ context: newQuery }) {

    const searchTerms = nucUtils.updateQuerySearchTerms(newQuery)

    this.runAsSystemUser(() => {

      Queries
        .updateOne({ _id: newQuery._id }, { $set: { c_search: searchTerms } })
        .execute()

    })

  }

}

module.exports = {
  QueriesLibrary
}