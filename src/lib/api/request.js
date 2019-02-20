
const request = require('request'),
      { privatesAccessor } = require('../privates'),
      { pathTo } = require('../utils'),
      { isSet, rBool } = require('../utils/values'),
      Fault = require('../fault')

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

    return new Promise((resolve, reject) => {

      const callback = stream ? () => {} : (error, response, data) => {

        const contentType = pathTo(response, 'headers.content-type')

        let err,
            result

        if (error) {
          err = Fault.from(error)
        } else if (pathTo(data, 'object') === 'fault') {
          err = Fault.from(data)
        } else if (options.json && pathTo(data, 'object') === 'result') {
          result = data.data
        } else if (contentType.indexOf('application/x-ndjson') === 0) {

          const array = data.split('\n').filter(v => v.trim()).map(v => JSON.parse(v)),
                last = array[array.length - 1]

          if (pathTo(last, 'object') === 'fault') {
            err = Fault.from(last)
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

        privates.response = response
        privates.error = err
        privates.result = result

        if (err) {
          reject(err)
        } else {
          resolve(result)
        }

      }

      privates.request = request(options, callback)

      if (stream) {
        resolve(privates.request.pipe(stream))
      }

    })

  }

}

module.exports = Request
