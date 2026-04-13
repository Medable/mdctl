const { route } = require('decorators')
const http = require('http')
const logger = require('logger')
const { generateToken } = require('c_sql_queries_handler')

const SERVICE_URLS = {
  'api-eu1.medable.com': 'https://sg-core-eu1.medable.tech',
  'api.dev.medable.com': 'https://sg-core-dev.medable.tech',
  'api-eu1-dev.medable.com': 'https://sg-core-eu1-dev.medable.tech',
  'api.dev.medable.cn': 'https://sg-core-cn1-dev.medable.cn',
  'api.qa.medable.com': 'https://sg-core-qa.medable.tech',
  'api.test.medable.com': 'https://sg-core-test.medable.tech'
}

const API_URL = `${SERVICE_URLS[script.env.host]}/api-core/v1/data/query`

class SqlApiEndpoint {

  /***********************************************************

  @brief    Api to submit sql quries and fetch response.

  ***********************************************************/

  @route({
    weight: 1,
    method: 'POST',
    name: 'run_sql_query',
    path: 'sql',
    acl: ['role.administrator']
  })
  static post({ body }) {
    const { sqlQuery, params } = body()

    const clientToken = generateToken()
    const headers = {
      Authorization: `Bearer ${clientToken}`,
      'Content-Type': 'application/json'
    }
    const query = {
      query: sqlQuery,
      params: params || {}
    }

    const response = http.post(API_URL, { headers, body: JSON.stringify(query), timeout: 5000 })
    if (response.statusCode !== 200) {
      logger.error('error on executing a sql query', response)
    }
    const res = JSON.parse(response.body)
    return res
  }

}

module.exports = SqlApiEndpoint