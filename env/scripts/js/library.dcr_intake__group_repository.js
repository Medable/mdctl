/**
 * @fileOverview
 * @summary Encapsulates details of working with org.objects.c_groups
 *
 * @author Data Management Squad
 *
 * @example
 * const { GroupRepository } = require('dcr_intake__group_repository')
 */

const { as } = require('decorators'),
      { c_groups } = org.objects,
      { accessLevels } = consts

/**
 * Group Repository
 *
 * @class GroupRepository
 */

class GroupRepository {

  /**
   * Get all groups
   * @memberOf GroupRepository
   * @return {Object[]} groups
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.read } })
  static getAll() {
    return c_groups
      .find()
      .toArray()
  }

  /**
   * Get a group by name
   * @memberOf GroupRepository
   * @param {String} groupName
   * @param {String[]=} expand
   * @return {Object[]} groups
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.read } })
  static findByName(groupName, expand = []) {
    return c_groups
      .find({ c_name: groupName })
      .expand(expand)
      .toArray()
  }

}

module.exports = { GroupRepository }