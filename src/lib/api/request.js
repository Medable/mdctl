
const request = require('request'),
      { privatesAccessor } = require('../privates'),
      pathTo = require('../utils/path.to'),
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
   * @returns {Promise<*>}
   */
  async run(input) {

    const privates = privatesAccessor(this),

          // don't fully clone in case of large payload
          options = Object.assign({}, isSet(input) ? input : {})

    if (privates.request) {
      throw new RangeError('request already running.')
    }

    options.json = rBool(input.json, true) // explicit default to json.

    return new Promise((resolve, reject) => {

      privates.request = request(options, (error, response, data) => {

        let err,
            result,
            contentType = pathTo(response, 'headers.content-type')

        if (error) {
          err = Fault.from(error)
        } else if (pathTo(data, 'object') === 'fault') {
          err = Fault.from(data)
        } else if (options.json && pathTo(data, 'object') === 'result') {
          result = data.data
        } else if (contentType.indexOf('application/x-ndjson') === 0) {

          const array = data.split('\n').filter(v => v.trim()).map(v => JSON.parse(v)),
                last = array[array.length-1]

          if (pathTo(last, 'object') === 'fault') {
            err = Fault.from(last)
          } else {
            result = {
              object: 'list',
              data: array,
              hasMore: false
            }
          }
        }

        privates.response = response
        privates.error = err
        privates.result = result

        if (err) {
          reject(err)
        } else {
          resolve(result)
        }

      })

    })

  }

}

module.exports = Request
