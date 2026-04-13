/**
 * @fileOverview
 * @summary Implements proxy to access internal dcr service.b.
 *
 * @author Data Management Squad
 *
 * @example
 * const { ProxyService } = require('dcr_intake__proxy_service')
 */

const config = require('config'),
      http = require('http')

/**
 * Proxy Service
 *
 * @class ProxyService
 */

class ProxyService {

  /**
   * Proxy request to internal service
   * @memberOf ProxyService
   * @param {Object} proxyParams
   * @return {Object} result
   */
  static proxy(proxyParams) {
    const { path, body, query, method, principal } = proxyParams,
          proxyConfig = config.get('dcr_intake__proxy_config')
    const response = http[method.toLowerCase()](`${proxyConfig.url}/${path}?${JSON.stringify(query)}`, {
      headers: {
        Authorization: `Bearer ${proxyConfig.token}`,
        'Content-Type': 'application/json',
        'x-principal': JSON.stringify({
          _id: principal._id,
          email: principal.email,
          name: principal.name,
          roleCodes: principal.roleCodes,
          roles: principal.roles,
          org: principal.org
        })
      },
      ...body && { body: JSON.stringify(body) }
    })
    if (response.statusCode >= 400) {
      // TODO: Implement error mapping to not lose error details
      throw JSON.parse(response.data.body)
    }
    return JSON.parse(response.data.body)
  }

}

module.exports = {
  ProxyService
}