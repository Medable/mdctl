const { Accounts } = org.objects
const http = require('http')
const config = require('config')
  .get('wf__sql_service_config')
const logger = require('logger')
const _ = require('lodash')

function generateToken() {
  const tokenOptions = {
    scope: ['user.sql-read-query'],
    permanent: false,
    expiresIn: 100
  }
  const token = Accounts
    .createAuthToken('wf__sql_service_app', script.principal._id, tokenOptions)
  return token
}

function getSqlQueryStatus(tableName) {
  try {
    const orgId = org._id
    const result = http.get(`${config.serviceUrls[script.env.host]}/sql/status/${orgId}_${tableName}`)
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

  const response = http.post(`${config.serviceUrls[script.env.host]}/sql`, { headers, body: JSON.stringify(query), timeout: 5000 })
  if (response.statusCode !== 200) {
    logger.error('error on executing a sql query', response)
  }
  return response
}

function sql(query) {
  const clientToken = generateToken()
  const headers = {
    Authorization: `Bearer ${clientToken}`,
    'Content-Type': 'application/json'
  }
  const payload = {
    query,
    params: {}
  }

  const response = http.post(`${config.dataServiceUrls[script.env.host]}/api-core/v1/data/query`, {
    headers,
    body: JSON.stringify(payload),
    timeout: 60000
  })
  if (response.statusCode !== 200) {
    logger.error('error on executing a sql query', response)
  }

  return _.get(JSON.parse(response.body), 'data', [])
}

module.exports = {
  executeSqlQuery,
  getSqlQueryStatus,
  sql
}