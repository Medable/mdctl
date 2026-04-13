/**
 * @fileOverview
 * @summary Encapsulates details of working with org.objects.c_site_users
 *
 * @author Data Management Squad
 *
 * @example
 * const { SiteUserRepository } = require('dcr_intake__site_user_repository')
 */

const { as } = require('decorators'),
      { c_site_users } = org.objects,
      { accessLevels } = consts

/**
 * Site User Repository
 *
 * @class SiteUserRepository
 */

class SiteUserRepository {

  /**
   * Check if site users exist by account id
   * @memberOf SiteUserRepository
   * @param  {String} accountId
   * @param  {String[]} roles
   * @return {Boolean}
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.read } })
  static checkIfExistsByAccountIdAndRoles(accountId, roles) {
    return c_site_users
      .find({
        c_account: accountId,
        c_role: {
          $in: roles
        }
      })
      .hasNext()
  }

  /**
  * Find site ids by account id
  * @memberOf SiteUserRepository
  * @param  {String} accountId
  * @param  {String[]} roles
  * @return {String[]}
  */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.read } })
  static findSiteIdsByAccountId(accountId, roles) {
    return c_site_users
      .find({
        c_account: accountId,
        c_role: {
          $in: roles
        }
      })
      .map(siteUser => siteUser.c_site._id.toString())
  }

}

module.exports = { SiteUserRepository }