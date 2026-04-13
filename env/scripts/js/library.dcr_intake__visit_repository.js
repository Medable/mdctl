/**
 * @fileOverview
 * @summary Encapsulates details of working with org.objects.c_visits
 *
 * @author Data Management Squad
 *
 * @example
 * const { VisitRepository } = require('dcr_intake__visit_repository')
 */

const { as } = require('decorators'),
      { c_visits } = org.objects,
      { accessLevels } = consts

/**
 * Visit Repository
 *
 * @class VisitRepository
 */

class VisitRepository {

  /**
   * Get all visits
   * @memberOf VisitRepository
   * @return {Object[]} visits
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.read } })
  static getAll() {
    return c_visits
      .find()
      .include('c_groups')
      .toArray()
  }

  /**
   * Get visits by name
   * @memberOf VisitRepository
   * @param {String} visitName
   * @param {String[]=} expand
   * @return {Object[]} visits
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.read } })
  static findByName(visitName, expand = []) {
    return c_visits
      .find({ 'c_name': visitName })
      .expand(expand)
      .toArray()
  }

    @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.read } })
    static findByVisitSchedule(visitScheduleId, expand = []) {
      return c_visits
        .find({ 'c_visit_schedules': visitScheduleId })
        .expand(expand)
        .toArray()
    }

}

module.exports = { VisitRepository }