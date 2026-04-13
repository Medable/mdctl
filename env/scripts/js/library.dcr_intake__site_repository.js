/**
 * @fileOverview
 * @summary Encapsulates details of working with org.objects.c_sites
 *
 * @author Data Management Squad
 *
 * @example
 * const { SiteRepository } = require('dcr_intake__site_repository')
 */

const { as } = require('decorators'),
      { c_sites } = org.objects,
      { accessLevels } = consts

/**
 * Site Repository
 *
 * @class SiteRepository
 */

class SiteRepository {

  /**
   * Find sites by ids
   * @memberOf SiteRepository
   * @param  {String[]} siteIds
   * @return {Object[]} sites
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.read } })
  static findByIds(siteIds) {
    return c_sites
      .find({
        _id: {
          $in: siteIds
        }
      })
      .toArray()
  }

  /**
   * Get site by id
   * @memberOf SiteRepository
   * @param  {String} siteId
   * @return {Object} site
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.read } })
  static getById(siteId) {
    return c_sites
      .find({
        _id: siteId
      })
      .next()
  }

  /**
   * Find all available site ids
   * @memberOf SiteRepository
   * @return {String[]} ids
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.read } })
  static findAllIds() {
    return c_sites
      .find()
      .map(site => site._id.toString())
  }

  /**
   * Find sites by name
   * @memberOf SiteRepository
   * @param  {String} siteName
   * @return {Object[]} sites
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.read } })
  static findByName(siteName) {
    return c_sites
      .find({
        c_name: siteName
      })
      .toArray()
  }

}

module.exports = { SiteRepository }