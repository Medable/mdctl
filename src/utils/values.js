
const _ = require('lodash'),
      isPrimitiveRegex = /^[sbn]/

let Undefined

function isPrimitive(value = null) {
  return value === null || isPrimitiveRegex.test(typeof value)
}

function isInt(n) {
  return typeof n === 'number' && parseFloat(n) === parseInt(n, 10) && !Number.isNaN(n)
}

function isNumeric(obj) {
  return !Array.isArray(obj) && (obj - (parseFloat(obj) + 1)) >= 0
}

function isInteger(a) {
  if (Number.isFinite(a)) {
    const b = String(a)
    return b === String(parseInt(b, 10))
  }
  return false
}

function isValidDate(d) {
  if (!_.isDate(d)) {
    return false
  }
  return !Number.isNaN(d.getTime())
}

function isSet(value) {
  return value !== null && value !== undefined
}

function rArray(val, wrap) {
  if (Array.isArray(val)) {
    return val
  }
  return wrap ? [val] : []
}

function rVal(val, defaultVal) {
  if (val === Undefined) return defaultVal
  return val
}

function rNum(val, defaultVal) {
  if (val === Undefined) return defaultVal
  if (isNumeric(val)) return parseFloat(val)
  return defaultVal
}

function rInt(val, defaultVal) {
  if (val === Undefined) return defaultVal
  if (isInteger(val)) return parseInt(val, 10)
  return defaultVal
}

function rString(val, defaultVal) {
  if (val === Undefined) return defaultVal
  if (_.isString(val)) return val
  return defaultVal
}

function rBool(boolValue, defaultValue) {
  return !!(boolValue === Undefined ? defaultValue : boolValue)
}

function getValidDate(d = null, defaultValue = null) {
  if (d === null) {
    return defaultValue === null ? null : getValidDate(defaultValue)
  }
  if (_.isDate(d)) {
    if (Number.isNaN(d.getTime())) {
      return null
    }
    return d
  }
  try {
    const local = new Date(Date.parse(d))
    if (isValidDate(local)) {
      return local
    }
  } catch (err) {
    // eslint-disable-line no-empty
  }
  return defaultValue === null ? null : getValidDate(defaultValue)

}

/**
     * pad(text, size, [char]): Left padding
     * pad(size, text, [char]): Right padding
     * @param string
     * @param size
     * @param character
     * @returns {string}
     */
function pad(string, size, character = null) {
  let padded,
      str = string,
      sz = size
  const char = isSet(character) ? character : ' '

  if (typeof str === 'number') {
    [str, sz] = [sz, str]
  }
  str = str.toString()
  padded = ''
  sz -= str.length
  for (let i = 0; size >= 0 ? i < size : i > size; size >= 0 ? (i += 1) : (i -= 1)) {
    padded += char
  }
  if (sz) {
    return padded + str
  }
  return str + padded

}

function clamp(number, min, max) {
  if (_.isNumber(number) && number > min) {
    return (number > max) ? max : number
  }
  return min
}

function resolveCallbackArguments(options, callback, ensure = true, once = true) {

  let optionsArgument,
      callbackArgument = callback

  if (_.isFunction(options)) {
    callbackArgument = once ? _.once(options) : options
    optionsArgument = {}
  } else {
    optionsArgument = options || {}
    callbackArgument = callback
    if (ensure && !_.isFunction(callback)) {
      callbackArgument = () => {}
    }
    if (once && _.isFunction(callback)) {
      callbackArgument = _.once(callback)
    }
  }
  return [optionsArgument, callbackArgument]
}

module.exports = {
  isPrimitive,
  isInt,
  isNumeric,
  isInteger,
  isValidDate,
  isSet,
  rArray,
  rVal,
  rNum,
  rInt,
  rString,
  rBool,
  getValidDate,
  pad,
  clamp,
  resolveCallbackArguments
}
