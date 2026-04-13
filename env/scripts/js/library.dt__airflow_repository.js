const config = require('config'),
      logger = require('logger'),
      http = require('http'),
      DAG_ID = 'sql_data_transfer'

class AirflowRepository {

  static dagRunStates = {
    SUCCESS: 'success',
    FAILED: 'failed'
  }

  static createDagRun(token, params) {
    return this._makeRequest(token, {
      method: 'post',
      path: `api/v1/dags/${DAG_ID}/dagRuns`,
      body: {
        conf: {
          sql: params.sqlQueriesPerFilename,
          format: params.fileFormat,
          dest_type: params.protocol,
          dest_address: params.dtConfigId,
          dest_file_name: params.bundleName,
          manifest: params.manifest
        }
      }
    })
  }

  static getDagRunById(token, dagRunId) {
    return this._makeRequest(token, {
      method: 'get',
      path: `api/v1/dags/${DAG_ID}/dagRuns/${dagRunId}`
    })
  }

  static _makeRequest(token, params) {
    const { method, path, body } = params,
          airflowUrl = config.get('dt__airflow_url'),
          response = http[method](`${airflowUrl}/${path}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            ...body && { body: JSON.stringify(body) }
          })
    if (response.statusCode >= 400) {
      logger.error('dt: Airflow API request failed:', {
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

module.exports = AirflowRepository