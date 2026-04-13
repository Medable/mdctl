/**
 * @fileOverview
 * @summary Encapsulates details of working with org.objects.c_step_responses
 *
 * @author Data Management Squad
 *
 * @example
 * const { StepResponseRepository } = require('dcr_intake__step_response_repository')
 */

const { as } = require('decorators'),
      { c_step_responses } = org.objects,
      { accessLevels } = consts

/**
 * Step Response Repository
 *
 * @class StepResponseRepository
 */

class StepResponseRepository {

  /**
   * Get a task response by filters
   * @memberOf TaskResponseRepository
   * @param {Object} filters
   * @param {String[]=} expand
   * @return {Object} task response
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.read } })
  static getOne(filters = {}, expand = []) {
    return c_step_responses
      .find(filters)
      .expand(expand)
      .next()
  }

  /**
   * Get step responses by filters
   * @memberOf StepResponseRepository
   * @param {Object} filters
   * @param {String[]=} expand
   * @return {Object} step response
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.read } })
  static getMany(filters = {}, expand = []) {
    return c_step_responses
      .find(filters)
      .expand(expand)
      .toArray()
  }

  /**
    * Find step responses by site ids and custom filters
    * @memberOf StepResponseRepository
    * @param {String[]} siteIds
    * @param {Object} filters
    * @param {String[]=} expand
    * @return {Object[]} step responses
    */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.read } })
  static findForSiteIds(siteIds, filters, expand = []) {
    return c_step_responses
      .find({
        ...filters,
        c_site: { $in: siteIds }
      })
      .expand(expand)
      .toArray()
  }

  /**
   * Update value
   * @memberOf StepResponseRepository
   * @param {Object} filters
   * @param {*} newValue
   * @param {String=} auditMessage
   * @return {Object} update result
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.read } })
  static updateValue(filters, newValue, auditMessage) {
    return c_step_responses.updateOne(filters, {
      $set: {
        c_value: newValue,
        ...(auditMessage && { audit: { message: auditMessage } })
      }
    })
      .execute()
  }

  /**
   * Change site for user
   * @memberOf StepResponseRepository
   * @param {String} publicUserId
   * @param {String} siteId
   * @param {String=} auditMessage
   * @return {Object} step response
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.update } })
  static updateSiteByPublicUserId(publicUserId, siteId, auditMessage) {
    return c_step_responses.updateMany({
      c_public_user: publicUserId
    }, {
      $set: {
        c_site: siteId,
        ...(auditMessage && { audit: { message: auditMessage } })
      }
    })
      .execute()
  }

  /**
   * Update the visit and group of a step response by the task response ids
   * @param {Array} taskResponseIds
   * @param {String} visitId
   * @param {String} groupId
   * @param {String=} auditMessage
   * @return {Object} update result
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.update } })
  static updateVisitAndGroupByTaskResponseIds(taskResponseIds, visitId, groupId, auditMessage) {
    return c_step_responses.updateMany({
      c_task_response: { $in: taskResponseIds }
    }, {
      $set: {
        c_group: groupId,
        c_visit: visitId,
        ...(auditMessage && { audit: { message: auditMessage } })
      }
    })
      .execute()
  }

}

module.exports = { StepResponseRepository }