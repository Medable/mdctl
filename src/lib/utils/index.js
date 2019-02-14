const _ = require('lodash'),
      util = require('util'),
      fs = require('fs'),
      { URL } = require('url'),
      jsyaml = require('js-yaml'),
      path = require('path'),
      isPlainObject = require('lodash.isplainobject'),
      pathTo = require('./path.to'),
      {
        isSet, rString, rFunction, naturalCmp
      } = require('./values')

let Undefined

function throwIf(message, expression) {
  if (expression) {
    throw new Error(message)
  }
  return true
}

function throwIfNot(message, expression) {
  return throwIf(message, !expression)
}

async function loadJsonOrYaml(file, multi) {
  if (path.extname(file) === '.yaml') {
    const docs = []
    jsyaml.safeLoadAll(fs.readFileSync(file, 'utf8'), d => docs.push(d), { filename: file })
    return multi ? docs : docs[0] || {}
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function tryCatch(fn = () => {}, callback = () => {}, waitLoop = false) {

  let err,
      result
  try {
    result = _.isFunction(fn) ? fn() : Undefined
  } catch (e) {
    err = e
  }
  if (_.isFunction(callback)) {
    if (waitLoop) {
      setImmediate(callback, err, result)
    } else {
      callback(err, result)
    }
  }
  return [err, result]

}

async function promised(scope, fn, ...args) {

  const p = util.promisify(rFunction(fn, pathTo(scope, fn)))

  return p.call(scope, ...args)
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeEndpoint(endpoint) {

  let str = rString(endpoint, '')
  if (str && !str.includes('://')) {
    str = `https://${str}`
  }
  return str

}

function validateEndpoint(endpoint) {
  try {
    const { protocol, host } = new URL('', endpoint)
    return !_.isEmpty(protocol) && !_.isEmpty(host)
  } catch (err) {
    return false
  }
}

function joinPaths(...paths) {

  return paths
    .map(p => (isSet(p) && p !== false) && String(p).trim())
    .filter(v => v)
    .join('.')

}

function sortKeys(input, deep = false) {

  let object = input

  if (Array.isArray(object)) {

    if (deep) {
      object.forEach((item, idx) => {
        object[idx] = sortKeys(item, deep)
      })
    }

  } else if (isPlainObject(object)) {

    const keys = Object.keys(object).sort(naturalCmp),
          sorted = {}

    keys.forEach((key) => {
      sorted[key] = deep ? sortKeys(object[key], deep) : object[key]
    })

    object = sorted
  }
  return object
}

function pathsTo(obj, ...paths) {
  return paths.reduce((memo, p) => {
    const value = pathTo(obj, p)
    if (value !== Undefined) {
      pathTo(memo, p, value)
    }
    return memo
  }, {})
}

module.exports = {
  throwIf,
  throwIfNot,
  sleep,
  promised,
  loadJsonOrYaml,
  tryCatch,
  normalizeEndpoint,
  validateEndpoint,
  joinPaths,
  sortKeys,
  pathsTo
}
