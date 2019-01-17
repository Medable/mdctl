
const request = require('request'),
      { EventEmitter } = require('events'),
      { privatesAccessor } = require('../privates'),
      pathTo = require('../utils/path.to'),
      { isSet } = require('../utils'),
      Fault = require('../fault')

/**
 * @emits response, error, result
 */
class Request extends EventEmitter {

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
   * @returns {Promise<*>}
   */
  async run(input) {

    const privates = privatesAccessor(this),

          // don't fully clone in case of large payload
          options = Object.assign({}, isSet(input) ? input : {})

    if (privates.request) {
      throw new RangeError('request already running.')
    }

    options.json = true // for now hardcode json input/output

    return new Promise((resolve, reject) => {

      privates.request = request(options, (error, response, data) => {

        let err,
            result

        if (error) {
          err = Fault.from(error)
        } else if (pathTo(data, 'object') === 'fault') {
          err = Fault.from(data)
        } else if (pathTo(data, 'object') === 'result') {
          result = data.data
        } else {
          result = data
        }

        privates.response = response
        privates.error = err
        privates.result = result

        if (response) {
          this.emit('response', response)
        }
        if (err) {
          this.emit('error', err)
          reject(err)
        } else {
          this.emit('result', result)
          resolve(data)
        }

      })

    })

  }

}

module.exports = Request
