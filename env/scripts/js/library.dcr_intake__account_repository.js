/**
 * @fileOverview
 * @summary Encapsulates details of working with org.objects.accounts
 *
 * @author Data Management Squad
 *
 * @example
 * const { AccountRepository } = require('dcr_intake__account_repository')
 */

const { accounts } = org.objects,
      { accessLevels } = consts

/**
 * Account Repository
 *
 * @class AccountRepository
 */

class AccountRepository {

  /**
   * Attempt auth with credentials
   * @memberOf AccountRepository
   * @param  {String} email
   * @param  {String} password
   * @return
   */
  static attemptAuth(email, password) {
    accounts.attemptAuth(email, password)
  }

  /**
   * Find site ids by account id
   * @memberOf SiteUserRepository
   * @param  {String} accountId
   * @return {String[]}
   */
  static findSiteIdsByAccountId(accountId) {
    const [axonSite] = accounts
      .find({ _id: accountId })
      .expand('c_sites')
      .skipAcl()
      .grant(accessLevels.read)
      .map(account => account.c_sites)
    return axonSite.data.map(site => site._id.toString())
  }

}

module.exports = { AccountRepository }