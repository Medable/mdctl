const requestModule = require('request'),
      inquirer = require('inquirer'),
      _ = require('lodash'),
      fs = require('fs'),
      jsyaml = require('js-yaml'),
      path = require('path'),
      Fault = require('../fault'),
      pathTo = require('./path.to')

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

async function request(options) {

  const requestPromise = async requestOptions => new Promise((resolve, reject) => {

    const req = requestModule(
      Object.assign({
        json: true
      }, requestOptions),
      (error, response, data) => {
        if (error) reject(error, req, response, data)
        else resolve([req, response, data])
      }
    )

  })

  let err,
      req,
      result

  try {

    [req, , result] = await requestPromise(options)

    if (pathTo(result, 'object') === 'fault') {
      err = Fault.from(result)
    } else if (pathTo(result, 'object') === 'result') {
      result = result.data
    }

  } catch (e) {

    err = Fault.from(err)
  }

  return [err, result, req]

}

async function yn(message, yes = true) {
  const result = await inquirer.prompt({
    type: 'confirm',
    name: 'question',
    message,
    default: yes
  })
  return Boolean(result && result.question)
}

async function question(message, def = '', options = {}) {
  const result = await inquirer.prompt(Object.assign({
    type: 'input',
    name: 'question',
    message,
    default: def
  }, options))
  return result && result.question
}

module.exports = {
  throwIf,
  throwIfNot,
  loadJsonOrYaml,
  tryCatch,
  request,
  yn,
  question
}
