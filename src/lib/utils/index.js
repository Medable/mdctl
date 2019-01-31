const _ = require('lodash'),
      util = require('util'),
      fs = require('fs'),
      { URL } = require('url'),
      jsyaml = require('js-yaml'),
      path = require('path'),
      pathTo = require('./path.to'),
      { rString, rFunction } = require('./values')

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

function isNullOrUndefined(value) {
  return _.isNull(value) || _.isUndefined(value)
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
  isNullOrUndefined
}
