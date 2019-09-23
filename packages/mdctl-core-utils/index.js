const _ = require('lodash'),
      { URL } = require('universal-url'),
      isPlainObject = require('lodash.isplainobject'),
      {
        isSet, rString, naturalCmp, pathTo, pathParts
      } = require('./values')

let Undefined

function searchParamsToObject(searchParams) {
  return Array.from(searchParams.entries()).reduce(
    (qs, [key, val]) => {
      let v = pathTo(qs, key)
      if (Array.isArray(v)) {
        v.push(val)
      } else if (isSet(v)) {
        v = [v, val]
        pathTo(qs, key, v)
      } else {
        pathTo(qs, key, val)
      }
      return qs
    },
    {}
  )
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

function validateApiKey(apiKey) {
  if (/^([0-9a-z-A-Z]){22}$/i.test(rString(apiKey))) {
    return true
  }
  throw new TypeError('Invalid api key')
}

function validateApiSecret(secret) {
  if (/^([0-9a-z-A-Z]){64}$/i.test(rString(secret))) {
    return true
  }
  throw new TypeError('Invalid api secret')
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

/**
 * @param options
 *  endpoint
 *  env
 *
 */
function guessEndpoint(options = {}) {

  const out = {},
        aliasedEndpoints = {
          prod: 'https://api.medable.com',
          'int-dev': 'https://api-int-dev.medable.com'
        },
        { endpoint, env } = options

  if (aliasedEndpoints[endpoint]) {
    out.endpoint = aliasedEndpoints[endpoint]
  }
  if (env) {
    const [endpointPart, envPart] = pathParts(env)
    if (endpointPart && envPart) {
      out.env = envPart
      if (aliasedEndpoints[endpointPart]) {
        out.endpoint = aliasedEndpoints[endpointPart]
      } else {
        out.endpoint = `https://api.${endpointPart}.medable.com`
      }
    } else {
      if (endpoint) {
        out.endpoint = endpoint
      }
      out.env = env
    }
  } else if (endpoint) {
    out.endpoint = endpoint
  }

  return out
}

// ------------------------------------------------------------------------------------

// return -1 to completely exit, -2 to prevent processing the current object's children
/* eslint-disable */
function _visit(obj, options, currentKey, parentObject, parentIsArray, depth, fullPath, parentFullPath, walked) {

  if (Array.isArray(obj)) {
    if (!walked.has(obj)) {
      walked.add(obj)
      if (options.fnObj) {
        const ret = options.fnObj(obj, currentKey, parentObject, parentIsArray, depth, fullPath, parentFullPath)
        if (ret === -1) {
          return -1
        } if (ret !== -2) {
          for (let key = 0; key < obj.length; key++) {
            if (_visit(obj[key], options, key, obj, true, depth, fullPath ? `${fullPath}.${key}` : key, fullPath, walked) === -1) {
              return -1
            }
          }
        }
      }
    }
  } else if (options.fnTest ? (_.isObject(obj) && options.fnTest(obj, currentKey, parentObject, parentIsArray, depth, fullPath, parentFullPath)) : isPlainObject(obj)) {
    if (!walked.has(obj)) {
      walked.add(obj)
      if (options.fnObj) {
        const ret = options.fnObj(obj, currentKey, parentObject, parentIsArray, depth, fullPath, parentFullPath)
        if (ret === -1) {
          return -1
        } if (ret !== -2) {
          for (const key in obj) {
            if (obj.hasOwnProperty && obj.hasOwnProperty(key)) {
              if (_visit(obj[key], options, key, obj, false, depth + 1, fullPath ? `${fullPath}.${key}` : key, fullPath, walked) === -1) {
                return -1
              }
            }
          }
        }
      }

    }
  } else if (options.fnVal) {
    if (options.fnVal(obj, currentKey, parentObject, parentIsArray, depth, fullPath || '', parentFullPath || '') === -1) {
      return -1
    }
  }

}

function visit(obj, options) {
  options = options || options
  if (options.fnObj && !_.isFunction(options.fnObj)) options.fnObj = null
  if (options.fnVal && !_.isFunction(options.fnVal)) options.fnVal = null
  if (options.fnTest && !_.isFunction(options.fnTest)) options.fnTest = null
  return _visit(obj, options, '', null, false, 0, '', '', new Set())

}

function isNodejs() { return typeof window === 'undefined' && typeof "process" !== "undefined" && process && process.versions && process.versions.node; }
/* eslint-enable */

module.exports = {
  searchParamsToObject,
  tryCatch,
  normalizeEndpoint,
  validateEndpoint,
  joinPaths,
  sortKeys,
  pathTo,
  pathsTo,
  validateApiKey,
  validateApiSecret,
  guessEndpoint,
  visit,
  isNodejs
}
