const { Accounts } = org.objects
const http = require('http')
const config = require('config')
  .get('c_sql_service_config')
const logger = require('logger')

function generateToken() {
  const tokenOptions = {
    scope: ['user.sql-read-query'],
    permanent: false,
    expiresIn: 100
  }
  const token = Accounts
    .createAuthToken('c_sql_service_app', script.principal._id, tokenOptions)
  return token
}

function getSqlGatewayUrl() {
  const host = script.env.host

  // For dynamic alpha environments (e.g., api-m2743.alpha-latest.medable.com)
  // Replace 'api-' with 'sg-' for alpha cluster hosts
  if (/\.alpha(-latest|-test|-staging)?\./.test(host) && host.startsWith('api-')) {
    return `https://${host.replace(/^api-/, 'sg-')}`
  }

  // Check if we have a direct mapping in config
  if (config.serviceUrls[host]) {
    return config.serviceUrls[host]
  }

  // If we get here, we couldn't determine the SQL Gateway URL
  logger.error(`No SQL Gateway URL mapping found for host: ${host}.`)
}

function getSqlQueryStatus(tableName) {
  try {
    const orgId = org._id
    const sqlGatewayUrl = getSqlGatewayUrl()
    const result = http.get(`${sqlGatewayUrl}/sql/status/${orgId}_${tableName}`)
    const response = JSON.parse(result.body)
    if (result.statusCode === 500) {
      throw new Error(response.error)
    }
    return response.status
  } catch (err) {
    logger.error('Error during status fetching: ', err)
    return 'error'
  }
}

function executeSqlQuery(ooTableName, sqlQuery, values) {
  const clientToken = generateToken()
  const headers = {
    Authorization: `Bearer ${clientToken}`,
    'Content-Type': 'application/json'
  }
  const query = {
    text: sqlQuery,
    values: values,
    target: ooTableName
  }

  const sqlGatewayUrl = getSqlGatewayUrl()
  const response = http.post(`${sqlGatewayUrl}/sql`, { headers, body: JSON.stringify(query), timeout: 5000 })
  if (response.statusCode !== 200) {
    logger.error('error on executing a sql query', response)
  }
  return response
}

module.exports = {
  executeSqlQuery,
  getSqlQueryStatus,
  generateToken
}