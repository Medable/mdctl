const isPlainObject = require('lodash.isplainobject'),
      { pathTo } = require('@medable/mdctl-core-utils'),
      { rString, rArray } = require('@medable/mdctl-core-utils/values')

class Fault extends Error {

  constructor(code, message, statusCode, name, reason, path, index) {

    super()

    Object.assign(this, {
      faults: [],
      code,
      reason,
      message: message || '',
      statusCode: statusCode || 500,
      name: name || 'fault',
      path,
      index
    })
  }

  toString() {
    return `${this.name} ${this.code}${((typeof this.message === 'string') && (this.message.length > 0)) ? (`: ${this.message}`) : ''}`
  }

  add(errOrCode, msg) {
    this.faults.push((errOrCode instanceof Error) ? errOrCode : Fault.create(errOrCode, msg))
  }

  getMessage() {
    if (typeof this.message === 'string' && (this.message.length > 0)) {
      return this.message
    }
    return this.reason || ''
  }

  static from(err, forceError) {

    // already a fault of non-convertible?
    if (err instanceof Fault) {
      return err
    }

    const isObject = isPlainObject(err)

    // detect a plain object that is a fault (perhaps a return value from a remote call).
    if (isObject && !(err instanceof Error)) {
      if (pathTo(err, 'object') === 'fault') {
        return Fault.create(
          err.code,
          err.message,
          err.statusCode || err.status || 500,
          err.name,
          err.reason,
          err.path,
          err.faults,
          err.index
        )
      }
    }

    if (err instanceof Error) {
      return new Fault('kError', err.message, err.statusCode || err.status, err.name || 'error', err.path, err.index)
    }

    if (forceError) {
      const errCode = rString(isObject ? err.code : 'kError', 'kError')
      return Fault.create(errCode, err)
    }

    return null

  }

  static create(code, msg, statusCode, name, reason, path, childFaults, index) {

    const opts = isPlainObject(msg) ? msg : null,
          fault = new Fault(
            code,
            opts ? (opts.msg || opts.message) : msg,
            (opts ? opts.statusCode : statusCode) || 500,
            (opts ? opts.name : name) || 'fault',
            opts ? opts.reason : reason,
            opts ? opts.path : path,
            opts ? opts.index : index
          )

    rArray(opts ? opts.faults : childFaults).forEach((f) => {
      const child = Fault.from(childFaults[f])
      if (child) fault.add(child)
    })

    return fault

  }

}

Object.assign(Error.prototype, {

  object: 'fault',
  code: 'kError',
  name: 'error',
  statusCode: 500,

  toJSON() {

    const json = {
      object: 'fault',
      name: this.name || 'error',
      code: this.code || 'kError',
      message: this.getMessage(),
      status: this.statusCode || this.status,
      trace: this.trace,
      path: this.path,
      reason: this.reason
    }

    if (this.faults && this.faults.length) {
      json.faults = []
      this.faults.forEach((f) => {
        json.faults.push(Fault.from(f, true).toJSON())
      })
    }

    if (typeof this.index === 'number' && this.index >= 0) {
      json.index = this.index
    }

    return json
  },

  add(obj) {
    const err = (obj instanceof Error) ? obj : Error.create(obj);
    (this.faults || (this.faults = [])).push(err)
  },

  getMessage() {
    return ((typeof this.message === 'string') ? this.message : '')
  }

})

module.exports = Fault
