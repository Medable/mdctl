/**
 * @fileOverview
 * @summary Encapsulates details of working with org.objects.org
 *
 * @author Data Management Squad
 *
 * @example
 * const { OrgRepository } = require('dcr_intake__org_repository')
 */
const { as } = require('decorators'),
      { accessLevels } = consts

/**
 * Org Repository
 *
 * @class OrgRepository
 */
class OrgRepository {

  /**
   * Get org code
   * @memberOf OrgRepository
   * @return {String} org code
   */
  static getCode() {
    const [{ code }] = org.objects.org
      .find()
      .paths('code')
      .toArray()
    return code
  }

  /**
   * Get api key
   * @memberOf OrgRepository
   * @return {String|void} api key
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.read } })
  static getApiKey() {
    const [{ apps }] = org.objects.org
      .find()
      .paths('apps')
      .toArray()
    const dcrApp = apps.find(app => app.name === 'dcr_intake__app')
    if (!dcrApp) return
    return dcrApp.clients[0].key
  }

}

module.exports = { OrgRepository }