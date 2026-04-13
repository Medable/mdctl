/**
* SSO Library
*
* @class SsoLibrary
*/

const qs = require('qs'),
      { rsa } = require('crypto'),
      { OrgLibrary } = require('ec__org_lib'),
      SSO_CODE_TTL_MS = 30 * 1000

class SsoLibrary {

  /**
  * Check if user has logged into the app using SSO
  * @memberOf SsoLibrary
  * @return {Boolean} sso
  */
  static checkIfSsoUser() {
    const [{ metadata }] = org.objects.audit.find({ 'context._id': script.principal._id, sub: 'login' })
      .limit(1)
      .sort({ _id: -1 })
      .skipAcl()
      .grant('read')
      .toArray()
    return { sso: metadata.sso || false }
  }

  /**
  * Generate callback url for Auth0 to redirect to
  * @memberOf SsoLibrary
  * @param {String} host
  * @param {String} returnTo
  * @return {String} url
  */
  static buildSsoCodeCallbackUrl(host, returnTo) {
    const orgCode = OrgLibrary.getCode(),
          baseUrl = `https://${host}/${orgCode}/v2`,
          returnToQuerystring = qs.stringify({
            return_to: returnTo
          }),
          querystring = qs.stringify({
            force_authn: 1,
            return_to: `${baseUrl}/routes/econsent/sso/generate-code?${returnToQuerystring}`
          })
    return `${baseUrl}/sso/oidc/login?${querystring}`
  }

  /**
  * Generate code and extend url to redirect with it
  * @memberOf SsoLibrary
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
  * @memberOf SsoLibrary
  * @return {String} code
  */
  static _generateSsoCode() {
    const apiKey = OrgLibrary.getApiKey()
    return rsa.encrypt(
      apiKey,
      Date.now(),
      'base64'
    )
  }

  /**
  * Validate code
  * @memberOf SsoLibrary
  * @param {String} code
  * @return {Boolean} isValid
  */
  static checkIfSsoCodeValid(code) {
    if (!code) return false
    const apiKey = OrgLibrary.getApiKey(),
          data = rsa.decrypt(
            apiKey,
            code
          )
    return Number(data) + SSO_CODE_TTL_MS > Date.now()
  }

}

module.exports = { SsoLibrary }