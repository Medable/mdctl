/* globals window */
/* eslint-disable no-nested-ternary, one-var */
const _ = require('lodash'),
      https = require('https'),
      axios = require('axios'),
      axiosCookieJarSupport = require('axios-cookiejar-support'),
      { pathTo } = require('@medable/mdctl-core-utils'),
      { isSet, rBool, rString } = require('@medable/mdctl-core-utils/values'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      { Fault } = require('@medable/mdctl-core'),
      adapter = require('./adapters')

if (_.isFunction(axiosCookieJarSupport)) {
  axiosCookieJarSupport(axios)
} else if (_.isFunction(axiosCookieJarSupport.default)) {
  axiosCookieJarSupport.default(axios)
}

axios.defaults.validateStatus = () => true

class Request {

  get request() {
    return privatesAccessor(this).request
  }

  get response() {
    return privatesAccessor(this).response
  }

  get error() {
    return privatesAccessor(this).error
  }

  get result() {
    return privatesAccessor(this).result
  }

  /**
   * @param input
   *  json: boolean defaults to true.
   *  stream: pipes here and resolves immediately without parsing.
   * @returns {Promise<*>}
   */
  async run(input) {

    const privates = privatesAccessor(this),
          // don't fully clone in case of large payload
          options = Object.assign({}, isSet(input) ? input : {}),
          { stream } = options

    if (privates.request) {
      throw new RangeError('request already running.')
    }

    options.json = rBool(input.json, true) // explicit default to json.
    delete options.stream

    pathTo(options.headers, 'Content-Type', rString(options.headers['Content-Type'], 'application/json'))
    const responseType = (stream ? 'stream' : options.json ? 'json' : 'arraybuffer'),
          requestConfig = {
            ...options,
            withCredentials: true,
            responseType: options.responseType || responseType,
            httpsAgent: new https.Agent({ rejectUnauthorized: options.strictSSL }),
            adapter: config => adapter(config, typeof window !== 'undefined' && stream, options.legacy)
          }

    try {
      const response = await axios.request(requestConfig),
            contentType = pathTo(response, 'headers.content-type'),
            { data } = response
      if (stream) {
        return typeof stream === 'boolean' ? data : data.pipe(stream)
      }
      let result

      if (pathTo(data, 'object') === 'fault') {
        throw Fault.from(data)
      } else if (options.json && pathTo(data, 'object') === 'result') {
        result = data.data
      } else if (contentType.indexOf('application/x-ndjson') === 0) {
        const array = Buffer.from(data).toString().split('\n').filter(v => v.trim())
                .map(v => JSON.parse(v)),
              last = array[array.length - 1]
        if (pathTo(last, 'object') === 'fault') {
          throw Fault.from(last)
        } else {
          result = {
            object: 'list',
            data: array,
            hasMore: false
          }
        }
      } else {
        result = data
      }

      privates.request = response.request
      privates.response = response
      privates.result = result
      return result
    } catch (e) {
      privates.response = e.response
      if (e.response && e.response.data) {
        if (stream) {
          return Promise.reject(e.response.data)
        }
        privates.error = Fault.from(e.response.data)
        return Promise.reject(privates.error)
      }
      return Promise.reject(e)
    }

  }

}

module.exports = Request
