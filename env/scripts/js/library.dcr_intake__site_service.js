/**
 * @fileOverview
 * @summary Implements site related logic.
 * Methods from repositories should be used to interact with other services/db.
 *
 * @author Data Management Squad
 *
 * @example
 * const { SiteService } = require('dcr_intake__site_service')
 */

const { SiteRepository } = require('dcr_intake__site_repository'),
      { AccountRepository } = require('dcr_intake__account_repository'),
      { SiteUserRepository } = require('dcr_intake__site_user_repository'),
      { AuthService } = require('dcr_intake__auth_service')

/**
 * Site Service
 *
 * @class SiteService
 */

class SiteService {

  /**
   * Find site ids that are available to the logged-in user
   * @memberOf SiteService
   * @return {String[]}
   */
  static findIdsForLoggedInUser() {
    const role = AuthService.getLoggedInAccountRole(),
          accountId = AuthService.getLoggedInAccountId()
    switch (role) {
      // TODO: rework - no value for filtering when all ids are returned
      case AuthService.roles.DATA_SERVICE_TEAM:
      case AuthService.roles.DCR_VIEW_ONLY:
          return SiteRepository.findAllIds()
      case AuthService.roles.DCR_VIEW_AND_COMMENT:
        return SiteRepository.findAllIds()
      case AuthService.roles.SITE_USER:
        return SiteUserRepository.findSiteIdsByAccountId(accountId, ['Site User', 'Site Investigator'])
      case AuthService.roles.SITE_MONITOR:
        return SiteUserRepository.findSiteIdsByAccountId(accountId, ['Site Monitor'])
      case AuthService.roles.AXON_SITE_MONITOR:
      case AuthService.roles.AXON_SITE_USER:
        return AccountRepository.findSiteIdsByAccountId(accountId)
      default:
        return []
    }
  }

  /**
   * Find sites for the logged-in user
   * @memberOf SiteService
   * @return {String[]}
   */
  static findForLoggedInUser() {
    const siteIds = this.findIdsForLoggedInUser()
    return SiteRepository.findByIds(siteIds)
  }

}

module.exports = { SiteService }