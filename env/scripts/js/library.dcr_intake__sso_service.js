/**
 * @fileOverview
 * @summary Implements SSO related logic.
 * Methods from repositories should be used to interact with other services/db.
 *
 * @author Data Management Squad
 *
 * @example
 * const { SsoService } = require('dcr_intake__sso_service')
 */

const qs = require('qs'),
      { rsa } = require('crypto'),
      { OrgRepository } = require('dcr_intake__org_repository'),
      SSO_CODE_TTL_MS = 30 * 1000

/**
 * SSO Service
 *
 * @class SsoService
 */

class SsoService {

  /**
   * Generate callback url for Auth0 to redirect to
   * @memberOf SsoService
   * @param {String} host
   * @param {String} returnTo
   * @return {String} url
   */
  static buildSsoCodeCallbackUrl(host, returnTo) {
    const orgCode = OrgRepository.getCode(),
          baseUrl = `https://${host}/${orgCode}/v2`,
          returnToQuerystring = qs.stringify({
            return_to: returnTo
          }),
          querystring = qs.stringify({
            force_authn: 1,
            return_to: `${baseUrl}/routes/dcr_intake/sso_code/callback?${returnToQuerystring}`
          })
    return `${baseUrl}/sso/oidc/login?${querystring}`
  }

  /**
   * Generate code and extend url to redirect with it
   * @memberOf SsoService
   * @param {String} returnTo
   * @param {Object} errorDetails Auth0 error details
   * @return {String} url
   */
  static generateSsoCodeAndPrepareReturnUrl(returnTo, errorDetails = {}) {
    const returnToQueryStartIndex = returnTo.indexOf('?')
    let returnToBaseUrl, returnToQuery, newQuery
    if (returnToQueryStartIndex !== -1) {
      returnToBaseUrl = returnTo.substring(0, returnToQueryStartIndex)
      returnToQuery = qs.parse(returnTo.substring(returnToQueryStartIndex + 1))
    } else {
      returnToBaseUrl = returnTo
    }
    if (errorDetails.error) {
      newQuery = errorDetails
    } else {
      newQuery = {
        code: this._generateSsoCode()
      }
    }
    const querystring = qs.stringify({
      ...(returnToQuery && qs.parse(returnToQuery)),
      ...newQuery
    })
    return `${returnToBaseUrl}?${querystring}`
  }

  /**
   * Generate code and save it in cache
   * @memberOf SsoService
   * @return {String} code
   */
  static _generateSsoCode() {
    const apiKey = OrgRepository.getApiKey()
    return rsa.encrypt(
      apiKey,
      Date.now(),
      'base64'
    )
  }

  /**
   * Validate code
   * @memberOf SsoService
   * @param {String} code
   * @return {Boolean} isValid
   */
  static checkIfSsoCodeValid(code) {
    if (!code) return false
    const apiKey = OrgRepository.getApiKey(),
          data = rsa.decrypt(
            apiKey,
            code
          )
    return Number(data) + SSO_CODE_TTL_MS > Date.now()
  }

}

module.exports = { SsoService }