const { isString } = require('lodash'),
      { isSet } = require('./values')

let Undefined

module.exports = function(object, path, value, returnTopOnWrite) {

  if (object === null || object === Undefined) {
    return Undefined
  }

  let obj = object

  const isStringPath = isString(path),
        isArray = Array.isArray(path),
        p = (isArray && path) || (isStringPath && path.split('.')),
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
