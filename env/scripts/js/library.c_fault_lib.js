const { expressions: { expression }, trigger } = require('decorators')

const { c_fault } = org.objects
const nativeFaultMap = {
  kInvalidArgument: 'invalidArgument',
  kValidationError: 'validationError',
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
}

class FaultLibrary {

  static throw(c_error_code) {
    const faultCursor = c_fault.find({ c_error_code })
      .skipAcl()
      .grant(consts.accessLevels.read)
    const fault = faultCursor.hasNext() && faultCursor.next()

    if (fault) {
      throw Fault.create({ errCode: fault.c_error_code, reason: fault.c_reason })
    } else if (c_error_code.startsWith('cortex.')) {
      throw Fault.create({ errCode: c_error_code })
    }

    throw Fault.create('kError', { reason: 'Unknown Error' })
  }

  @expression
    axon__throw_fault = {
      $let: {
        vars: {
          faults:
            {
              $dbNext: {
                $object: {
                  grant: 'read',
                  maxTimeMS: 10000,
                  object: 'c_fault',
                  operation: 'cursor',
                  where: {
                    $object: {
                      c_error_code: '$$ROOT.err_code'
                    }
                  },
                  skipAcl: true
                }
              }
            }
        },
        in: {
          $cond: {
            if: '$$faults',
            then: { $throw: { $object: { code: '$$faults.c_error_code', reason: '$$faults.c_reason' } } },
            else: { $throw: { code: 'kError', reason: 'Unknown Error' } }
          }
        }
      }
    }

  static getErrCode(err) {
    if (err.errCode) {
      return err.errCode
    } else {
      if (err.faults) {
        for (const f of err.faults) {
          const error = this.getErrCode(f)
          if (error) {
            return error
          }
        }
      }
    }
  }

  static getErrorCode(obj) {
    const nativeCode = nativeFaultMap[obj.c_native_code] || 'error'
    return `${obj.c_namespace}.${nativeCode}.${obj.c_detail_code}`
  }

  @trigger('create.before', { object: 'c_fault', weight: 1 })
  static faultBeforeCreate() {
    if (!script.arguments.new.c_error_code) {
      const c_error_code = FaultLibrary.getErrorCode(script.arguments.new)
      script.arguments.new.update({ c_error_code })
    }
  }

  @trigger('update.before', { object: 'c_fault', weight: 1 })
  static faultBeforeUpdate() {
    // If err_code isn't set on creation then is it set
    if (!script.arguments.new.c_error_code) {
      const obj = Object.assign(script.arguments.old, script.arguments.new)
      const c_error_code = FaultLibrary.getErrorCode(obj)
      script.arguments.new.update({ c_error_code })
    }
  }

}

module.exports = FaultLibrary