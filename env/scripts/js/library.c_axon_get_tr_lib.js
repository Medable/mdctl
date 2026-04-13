/***********************************************************

@script     Axon - Create Task Response Managment Library

@brief      Lib to create the task response and child step
            responses. Checks for duplicate task responses
            and handles accordingly

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/
import {
  route,
  log
} from 'decorators'

const { accounts } = org.objects

export class TaskResponseQuery {

  @log({ traceError: true })
  @route({
    method: 'GET',
    name: 'c_get_task_responses',
    path: 'accounts/:accountId/c_sites/:siteId/c_subjects/:subjectId/c_task_responses',
    authValidation: 'all',
    weight: 10,
    acl: [
      'account.public'
    ]
  })
  static getTaskResponses({ req }) {
    const { accountId, siteId, subjectId } = req.params
    if (!this.isAllowedUser(script.principal._id, siteId)) {
      throw Fault.create('kAccessDenied')
    }
    let { where, sort, limit, firstFetched, lastFetched } = req.query

    if (where) {
      where = JSON.parse(where)
    } else {
      where = {}
    }
    if (sort) {
      sort = JSON.parse(sort)
      sort._id = firstFetched ? 1 : -1
    } else {
      sort = { _id: firstFetched ? 1 : -1 }
    }

    if (lastFetched) {
      where._id = { $lt: lastFetched }
    } else if (firstFetched) {
      where._id = { $gt: firstFetched }
    }

    let taskResponseCursor

    taskResponseCursor = accounts
      .find()
      .pathPrefix(`${accountId}/c_sites/${siteId}/c_subjects/${subjectId}/c_task_responses`)
      .sort(sort)
      .where({
        ...where,
        ...{
          c_completed: true
        }
      })
      .expand('c_task')
    if (limit) {
      taskResponseCursor = taskResponseCursor.limit(limit)
    }
    return taskResponseCursor.transform('c_axon_calc_task_response_open_queries')
  }

  static isAllowedUser(accountId, siteId) {
    const accountsCursor = accounts.find({ _id: accountId })
      .paths('c_site_access_list')
    if (!accountsCursor.hasNext()) {
      return false
    }
    const { c_site_access_list: siteAccessList } = accountsCursor.next()
    const hasAccess = siteAccessList.some((element) => element.toString() === siteId.toString())
    return hasAccess
  }

}