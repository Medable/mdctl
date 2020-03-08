const _ = require('lodash'),
      jsYaml = require('js-yaml'),
      naturalCmp = require('string-natural-compare'),
      TRUE = ['y', 'yes', 'true', '1'],
      FALSE = ['n', 'no', 'false', '0'],
      isPrimitiveRegex = /^[sbn]/,
      isAbsoluteURLRegex = /^(?:[a-z]+:)?\/\//

let Undefined

function isAbsoluteURL(value) {
  return isAbsoluteURLRegex.test(value)
}

function isPrimitive(value = null) {
  return value === null || isPrimitiveRegex.test(typeof value)
}

function isInt(n) {
  return typeof n === 'number' && parseFloat(n) === parseInt(n, 10) && !Number.isNaN(n)
}

function isString(n) {
  return typeof n === 'string'
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
  if (val === Undefined) {
    return defaultVal
  }
  return val
}

function rNum(val, defaultVal) {
  if (val === Undefined) {
    return defaultVal
  }
  if (isNumeric(val)) {
    return parseFloat(val)
  }
  return defaultVal
}

function rInt(val, defaultVal) {
  if (val === Undefined) {
    return defaultVal
  }
  if (isInteger(val)) {
    return parseInt(val, 10)
  }
  return defaultVal
}

function rString(val, defaultVal) {
  if (val === Undefined) {
    return defaultVal
  }
  if (_.isString(val)) {
    return val
  }
  return defaultVal
}

function rFunction(val, defaultVal = () => {}) {
  if (_.isFunction(val)) {
    return val
  }
  return defaultVal
}

function rBool(boolValue, defaultValue) {
  return !!(boolValue === Undefined ? defaultValue : boolValue)
}

function rDate(d = null, defaultValue = null) {
  if (d === null) {
    return defaultValue === null ? null : rDate(defaultValue)
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
  return defaultValue === null ? null : rDate(defaultValue)

}

function rPath(options, path, defaultValue) {
  const value = pathTo(options, path)
  if (value !== Undefined) {
    return value
  }
  return defaultValue
}

function rInstance(value, Cls, defaultValue) {
  return (isSet(value) && (value instanceof Cls)) ? value : defaultValue
}

function pathTo(object, propertyPath, value, returnTopOnWrite) {

  if (object === null || object === Undefined) {
    return Undefined
  }

  let obj = object

  const isStringPath = _.isString(propertyPath),
        isArray = Array.isArray(propertyPath),
        p = (isArray && propertyPath) || (isStringPath && propertyPath.split('.')),
        write = arguments.length > 2

  if (!isStringPath && !isArray) {
    return Undefined
  }

  if (write) {
    if (!isSet(obj)) obj = {}
    const top = obj
    for (let i = 0, j = p.length - 1; i < j; i += 1) {
      if (obj[p[i]] === null || obj[p[i]] === Undefined) {
        obj[p[i]] = {}
      }
      obj = obj[p[i]]
    }
    obj[p[p.length - 1]] = value
    if (returnTopOnWrite) return top
  } else {
    for (let i = 0, j = p.length; i < j; i += 1) {
      if (obj !== null && obj !== Undefined) {
        obj = obj[p[i]]
      }
    }
  }
  return obj
}

function pathParts(input = null) {

  let propertyPath
  if (input === null) {
    propertyPath = ''
  } else if (!_.isString(input)) {
    propertyPath = input.toString()
  } else {
    propertyPath = input
  }
  const dot = propertyPath.indexOf('.'),
        prefix = dot !== -1 ? propertyPath.substr(0, dot) : propertyPath,
        suffix = dot !== -1 ? propertyPath.substr(dot + 1) : Undefined

  return [prefix || Undefined, suffix || Undefined]

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

function isCustomName(name) {
  return _.isString(name) && (name.indexOf('c_') === 0 || name.includes('__'))
}

function isUuidKeyFormat(name) {
  return _.isString(name) && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-4][0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name)
}

function isExportKey(name) {
  return isCustomName(name) || isUuidKeyFormat(name)
}

/**
 * accepts 'y', 'yes', 'true' or 1 as true, 'n', 'no', 'false' or '0'. provide a default
 */
function stringToBoolean(val, defaultVal) {
  if (val !== null && val !== Undefined) {
    if (FALSE.includes(String(val).toLowerCase())) {
      return false
    }
    if (TRUE.includes(String(val).toLowerCase())) {
      return true
    }
  }
  return defaultVal
}

function stringifyContent(content, format) {
  const cleanedContent = JSON.parse(JSON.stringify(content))
  let contentStr = ''
  if (format === 'yaml') {
    contentStr = jsYaml.safeDump(cleanedContent)
  } else {
    contentStr = JSON.stringify(cleanedContent, null, 2)
  }
  return contentStr
}

function parseString(content, format) {
  if (format === 'yaml') {
    return jsYaml.safeLoad(content)
  }
  return JSON.parse(content)
}

function removeFalsy(obj, emptyArrays = false) {
  const newObj = {}
  Object.keys(obj).forEach((prop) => {
    if (obj[prop] && (emptyArrays ? obj[prop].length : true)) {
      newObj[prop] = obj[prop]
    }
  })
  return newObj
}

function isObject(v) {
  const type = typeof v
  return type === 'function' || (type === 'object' && !!v)
}

function compact(object, ...values) {
  if (isObject(object) && values.length) {
    Object.keys(object).forEach((key) => {
      if (values.includes((object[key]))) {
        delete object[key] // eslint-disable-line no-param-reassign
      }
    })
  }
  return object
}

module.exports = {
  isAbsoluteURL,
  isPrimitive,
  isInt,
  isNumeric,
  isString,
  isInteger,
  isValidDate,
  rFunction,
  isSet,
  rArray,
  stringToBoolean,
  rVal,
  rNum,
  rInt,
  rString,
  rBool,
  rDate,
  rPath,
  rInstance,
  pad,
  clamp,
  resolveCallbackArguments,
  isCustomName,
  isExportKey,
  isUuidKeyFormat,
  naturalCmp,
  stringifyContent,
  parseString,
  removeFalsy,
  pathTo,
  pathParts,
  compact,
  isObject
}
