const isPlainObject = require('lodash.isplainobject'),
      { pathTo } = require('@medable/mdctl-core-utils'),
      { rString, rArray } = require('@medable/mdctl-core-utils/values'),
      faultErrCodeLookup = {
        kInvalidArgument: 'invalidArgument',
        kValidationError: 'validation',
        kAccessDenied: 'accessDenied',
        kNotFound: 'notFound',
        kTimeout: 'timeout',
        kExists: 'exists',
        kExpired: 'expired',
        kRequestTooLarge: 'tooLarge',
        kThrottled: 'throttled',
        kTooBusy: 'tooBusy',
        kError: 'error',
        kNotImplemented: 'notImplemented',
        kUnsupportedOperation: 'unsupportedOperation'
      },
      faultCodeLookup = {
        invalidArgument: 'kInvalidArgument',
        validation: 'kValidationError',
        accessDenied: 'kAccessDenied',
        notFound: 'kNotFound',
        timeout: 'kTimeout',
        exists: 'kExists',
        expired: 'kExpired',
        tooLarge: 'kRequestTooLarge',
        throttled: 'kThrottled',
        tooBusy: 'kTooBusy',
        error: 'kError',
        notImplemented: 'kNotImplemented',
        unsupportedOperation: 'kUnsupportedOperation'
      }

class Fault extends Error {

  constructor(code, message, statusCode, name, reason, path, index, resource) {

    super()

    const obj = Fault.normalizeOptions(
      code, message, statusCode, name, reason, path, [], null, index, resource
    )

    this.faults = []
    this.errCode = obj.errCode
    this.code = obj.code
    this.statusCode = obj.statusCode
    this.name = obj.name
    this.reason = obj.reason
    this.path = obj.path
    this.resource = obj.resource
    this.trace = obj.trace
    this.index = obj.index
    this.message = obj.message

    rArray(obj.faults).forEach((f) => {
      const child = Fault.from(f)
      if (child) this.add(child)
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

  static normalizeOptions(input, msg, statusCode, name, reason, path, faults, trace, index, resource) {

    let obj,
        errCode,
        code = input

    if (isPlainObject(code)) {
      obj = { ...code }
    } else {
      if (Fault.isErrCode(code)) {
        errCode = code
        code = Fault.errCodeToCode(errCode)
      } else {
        errCode = Fault.codeToErrCode(code)
      }
      if (isPlainObject(msg)) {
        obj = { errCode, code, ...msg }
      } else {
        obj = {
          errCode, code, msg, statusCode, name, reason, path, resource, trace, index, faults
        }
      }
    }

    obj.errCode = obj.errCode
      || (Fault.isErrCode(obj.code) ? obj.code : Fault.codeToErrCode(obj.code))
    obj.code = obj.code || Fault.errCodeToCode(obj.errCode)
    obj.message = obj.msg || obj.message
    obj.statusCode = obj.statusCode || obj.status || 500

    return obj

  }

  static isErrCode(code) {
    return typeof code === 'string' && code.indexOf('.') !== -1
  }

  static errCodeToCode(errCode) {
    if (Fault.isErrCode(errCode)) {
      const [, code] = errCode.split('.')
      return faultCodeLookup[code] || 'kError'
    }
    return 'kError'
  }

  static codeToErrCode(code = 'kError', ns = 'mdctl', detail = 'unspecified') {
    return [ns, faultErrCodeLookup[code] || 'error', detail].join('.')

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
          err
        )
      }
    }

    if (err instanceof Error) {
      return new Fault('kError', err.message, err.statusCode || err.status, err.name || 'error', err.path, err.index, err.resource)
    }

    if (forceError) {
      const errCode = rString(isObject ? err.code : 'kError', 'kError')
      return Fault.create(errCode, err)
    }

    return null

  }

  static create(code, msg, statusCode, name, reason, path, childFaults, index, resource) {

    const opts = isPlainObject(msg) ? msg : null,
          fault = new Fault(
            code,
            opts ? (opts.msg || opts.message) : msg,
            (opts ? opts.statusCode : statusCode) || 500,
            (opts ? opts.name : name) || 'fault',
            opts ? opts.reason : reason,
            opts ? opts.path : path,
            opts ? opts.index : index,
            opts ? opts.resource : resource
          )

    rArray(opts ? opts.faults : childFaults).forEach((f) => {
      const child = Fault.from(f)
      if (child) fault.add(child)
    })

    return fault

  }

}

Object.assign(Error.prototype, {

  object: 'fault',
  errCode: 'mdctl.error.unspecified',
  code: 'kError',
  name: 'error',
  statusCode: 500,

  toJSON() {

    const json = {
      object: 'fault',
      name: this.name || 'error',
      errCode: this.errCode || 'mdctl.error.unspecified',
      code: this.code || 'kError',
      message: this.getMessage(),
      status: this.statusCode || this.status,
      trace: this.trace,
      path: this.path,
      resource: this.resource,
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
