const config = require('config'),
      logger = require('logger'),
      http = require('http')

class SqlQueryRepository {

  static execute(token, query) {
    return this._makeRequest(token, {
      method: 'post',
      path: 'data/query',
      body: {
        query,
        params: {}
      }
    })
  }

  static _makeRequest(token, params) {
    const { method, path, body } = params,
          sqlApiUrl = config.get('dt__sql_api_url'),
          response = http[method](`${sqlApiUrl}/api-core/v1/${path}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            ...body && { body: JSON.stringify(body) }
          })
    if (response.statusCode >= 400) {
      logger.error('dt: SQL API request failed:', {
        method,
        path,
        requestBody: body,
        responseStatusCode: response.statusCode,
        responseBody: response.body
      })
      throw response
    }
    return JSON.parse(response.body)
  }

}

module.exports = SqlQueryRepository