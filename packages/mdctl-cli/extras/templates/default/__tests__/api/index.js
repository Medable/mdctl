import { Client } from '@medable/mdctl-api'
import _ from 'lodash'
import { addDeletionPath } from '../helpers'

const queryString = require('query-string')

class ApiError extends Error {

  constructor(err, verb, urlPath, body) {
    super()
    Object.assign(this, err)
    this.name = `${err.statusCode}: ${err.errCode}`
    this.message = `Failed to [${verb.toUpperCase()}] ${urlPath}
body:
${body ? `${JSON.stringify(body, null, 2)}` : ''}
response:
${JSON.stringify(err, null, 2)}`
  }

}

const Api = (config) => {
  const _stringifyQuery = (query = {}) => {
          _(query)
            .forEach((value, key) => {
              query[key] = _.isString(value) ? value : JSON.stringify(value)
            })
          return queryString.stringify(query)
        },

        _withWait = (res, timeout) => new Promise((resolve) => {
          setTimeout(() => {
            resolve(res)
          }, _.isNumber(timeout) ? timeout : 2500)
        }),

        _clientWrapper = mdctlClient => async(verb, urlPath, body, options) => {
          try {
            const clientOpts = (verb.toLowerCase()
              .trim() === 'get' && options)
              ? { body, ...options }
              : body
            const res = await mdctlClient[verb.toLowerCase()
              .trim()](urlPath, clientOpts, options)
            return res
          } catch (err) {
            const apiError = new ApiError(err, verb, urlPath, body)
            throw apiError
          }
        },
        client = _clientWrapper(new Client(config))

  return {
    anonymousClient() {
      const anonymousConfig = {
        ...config,
        credentials: {
          apiKey: config.credentials.apiKey
        }
      }
      return Api(anonymousConfig)
    },
    clientForCreds(credentials) {
      const newConfig = {
        ...config,
        ...{
          credentials: {
            username: credentials.email,
            password: credentials.password,
            type: 'password',
            apiKey: config.credentials.apiKey
          }
        }
      }
      return Api(newConfig)
    },
    login: () => client('post', '/accounts/login', { email: config.credentials.username, password: config.credentials.password }),
    get(urlPath, query, options) {
      return client('get', `${urlPath}${query ? `?${_stringifyQuery(query)}` : ''}`, {}, options)
    },
    async post(urlPath, body, waitForTriggers, options, provisionedData = false) {
      const res = await client('post', urlPath, body || {}, options)
      if (!provisionedData && Boolean(res)) addDeletionPath(res.object, res._id)
      return waitForTriggers ? _withWait(res, waitForTriggers) : res
    },
    async put(urlPath, body, waitForTriggers, options) {
      const res = await client('put', urlPath, body || {}, options)
      return waitForTriggers ? _withWait(res, waitForTriggers) : res
    },
    async patch(urlPath, body, waitForTriggers, options) {
      const res = await client('patch', urlPath, body || {}, options)
      return waitForTriggers ? _withWait(res, waitForTriggers) : res
    },
    delete(urlPath, query, options) {
      return client('delete', `${urlPath}${query ? `?${_stringifyQuery(query)}` : ''}`, {}, options)
    }
  }
}

export default Api
