/**
 * @fileOverview
 * @summary Encapsulates details of working with org.objects.c_task_responses
 *
 * @author Data Management Squad
 *
 * @example
 * const { TaskResponseRepository } = require('dcr_intake__task_response_repository')
 */

const { as } = require('decorators'),
      { c_task_responses } = org.objects,
      { accessLevels } = consts

/**
 * Task Response Repository
 *
 * @class TaskResponseRepository
 */

class TaskResponseRepository {

  static statuses = {
    INACTIVE: 'Inactive',
    NEW: 'New',
    INCOMPLETE: 'Incomplete',
    COMPLETE: 'Complete',
    REVIEWED: 'Reviewed'
  }

  /**
   * Change site for user
   * @memberOf TaskResponseRepository
   * @param {String} publicUserId
   * @param {String} siteId
   * @param {String=} auditMessage
   * @return {Object} update result
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.update } })
  static updateSiteByPublicUserId(publicUserId, siteId, auditMessage) {
    return c_task_responses.updateMany({
      c_public_user: publicUserId
    },
    {
      $set: {
        c_site: siteId,
        ...(auditMessage && { audit: { message: auditMessage } })
      }
    })
      .execute()
  }

  /**
   * Get list of task responses by public user ID and visit ID
   * @param {Object} filters
   * @param {String[]=} expand
   * @return {Object[]} task responses
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.update } })
  static findComplete(filters = {}, expand = []) {
    return c_task_responses.find({
      ...filters,
      c_status: this.statuses.COMPLETE
    })
      .expand(expand)
      .toArray()
  }

  /**
   * Update a task response's visit and group ID
   * @param {Array} taskResponseIds
   * @param {String} visitId
   * @param {String} groupId
   * @param {String=} auditMessage
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.update } })
  static updateVisitAndGroupByTaskResponseIds(taskResponseIds, visitId, groupId, auditMessage) {
    return c_task_responses.updateMany(
      { _id: { $in: taskResponseIds } },
      {
        $set: {
          c_group: groupId,
          c_visit: visitId,
          ...(auditMessage && { audit: { message: auditMessage } })
        }
      }
    )
      .execute()
  }

  /**
   * Find task responses by site ids and custom filters
   * @memberOf TaskResponseRepository
   * @param {String[]} siteIds
   * @param {Object} filters
   * @param {String[]=} expand
   * @return {Object[]} task responses
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.read } })
  static findForSiteIds(siteIds, filters, expand = []) {
    return c_task_responses
      .find({
        ...filters,
        c_site: { $in: siteIds }
      })
      .expand(expand)
      .toArray()
  }

  /**
   * Update a task response's status to inactive
   * @memberOf TaskResponseRepository
   * @param {String[]} taskResponseIds
   * @param {String=} auditMessage
   * @return {void}
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.script }, modules: { safe: false } })
  static setInactiveByIds(taskResponseIds, auditMessage) {
    c_task_responses
      .updateMany({
        _id: { $in: taskResponseIds }
      }, {
        $set: {
          c_status: this.statuses.INACTIVE,
          ...(auditMessage && { audit: { message: auditMessage } })
        }
      })
      .execute()
  }

  /**
   * Get a task response by filters
   * @memberOf TaskResponseRepository
   * @param {Object} filters
   * @param {String[]=} expand
   * @return {Object} task response
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.read } })
  static getOne(filters = {}, expand = []) {
    return c_task_responses
      .find(filters)
      .expand(expand)
      .next()
  }

  /**
   * Find all task responses for a participant by public user ID
   * @memberOf TaskResponseRepository
   * @param {String} publicUserId
   * @param {String[]=} expand
   * @return {Object[]} task responses
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.read } })
  static findByPublicUserId(publicUserId, expand = []) {
    return c_task_responses
      .find({
        c_public_user: publicUserId
      })
      .expand(expand)
      .toArray()
  }

  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.read } })
  static findForVisitId(visitId, expand = []) {
    return c_task_responses
      .find({
        c_visit: visitId
      })
      .expand(expand)
      .toArray()
  }

}

module.exports = { TaskResponseRepository }