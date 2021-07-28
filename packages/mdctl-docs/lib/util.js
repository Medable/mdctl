const fs = require('fs')
const path = require('path')

/**
 * Function
 */
function noop() {

}

/**
 * String
 */
function capitalizeFirstCharacter(s) {
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}`
}

function removeExtention(s) {
  return typeof s === 'string' ? s.replace(/\.[^/.]+$/, '') : s
}

function capitalize(s) {
  return typeof s === 'string' ? s.toUpperCase() : s
}

/**
 * Object
 */
function clone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

function array2Obj(array, opts) {
  const {
          key,
          keyTransform,
          valueTransform
        } = Object.assign({}, {
          key: 'id',
          keyTransform: noop,
          valueTransform: noop
        }, opts),
        obj = {}
  array.forEach((item) => {
    if (!(item[key] == null)) {
      obj[keyTransform(item[key])] = valueTransform(item)
    }
  })
  return obj
}

function determineResourceLevel(rawResource, level = 1) {
  return rawResource.label || rawResource.name
    ? level + 1
    : level
}

function breakdownResource(rawResource, level = 1) {
  const scripts = [],
        sets = [],
        resources = [],
        properties = [],
        label = rawResource.label
          || rawResource.name

  Object.entries(rawResource).forEach(([key, value]) => {
    if (value !== null) {
      if (typeof value === 'object') {
        const nextLevel = level + 1
        if (Array.isArray(value)) {
          if (['[object Object]', '[object Array]'].includes(Object.prototype.toString.call(value[0]))) {
            resources.push({
              label: key,
              level: nextLevel,
              resources: value.map(rawSubResource => breakdownResource(
                rawSubResource,
                determineResourceLevel(rawSubResource, nextLevel)
              ))
            })
          } else if (!(value[0] == null)) {
            sets.push({ key, value })
          }
        } else {
          resources.push({
            ...breakdownResource(value, determineResourceLevel(value, nextLevel)),
            label: key
          })
        }
      } else if (key === 'script') {
        const isScriptText = false
        if (isScriptText) {
          scripts.push({
            code: value,
            language: 'javascript'
          })
        }
      } else if (key !== 'label') {
        properties.push({ key, value })
      }
    }
  })

  return {
    scripts,
    sets,
    properties,
    label,
    level,
    resources,
  }
}

/**
 * Files
 */

function listDir(dir, prependDir = false){
  try {
    return prependDir
      ? fs.readdirSync(dir).map(filename => path.join(dir, filename))
      : fs.readdirSync(dir)
  } catch(err){
    console.warn(err)
    return []
  }
}

function read(file, encoding = 'utf8') {
  return fs.readFileSync(file, encoding)
}

function readJson(path, empty = {}) {
  try {
    return JSON.parse(fs.readFileSync(path))
  } catch (err) {
    console.warn(`Unable to read ${path}`)
    return empty
  }
}

function writeFiles(files, location) {
  for (let i = 0; i < files.length; i += 1) {
    writeFile(files[i], location)
  }
}

function writeFile(file, location) {
  const filePath = file.path ? path.join(location, file.path) : location,
        fileLocation = path.join(filePath, file.name)
  ensureDir(filePath)
  fs.writeFileSync(fileLocation, file.content)
}

function ensureDir(directory) {
  const folders = directory.split('/')
  if (directory.startsWith('/')) {
    folders[0] = '/'
  }
  let location = '',
      folder = folders.shift()
  while (folder) {
    location = path.join(location, folder)
    if (!fs.existsSync(location)) {
      fs.mkdirSync(location)
    }
    folder = folders.shift()
  }
}

function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK)
  } catch (err) {
    return false
  }
  return true
}

/**
 * Template
 */
function compareParams(a, b) {
  const nameA = a.name.toLowerCase(),
        nameB = b.name.toLowerCase()
  if (nameA < nameB) {
    return -1
  }
  if (nameA > nameB) {
    return 1
  }
  return 0
}

function translateParams(params) {
  return params
    .sort(compareParams)
    .reduce((formattedParams, param) => {
      const uri = param.name.split('.')

      let list = formattedParams,
          name = uri.shift()
      while (name) {
        if (uri.length === 0) {
          list.push({
            name,
            typeString: param.type
              ? param.type.names.join('|')
              : undefined,
            description: param.description,
            children: []
          })
        } else {
          const target = findParam(list, name)
          if (!target) {
            break
          }
          list = target.children
        }
        name = uri.shift()
      }
      return formattedParams
    }, [])
}

function findParam(params, name) {
  return params.find(param => param.name === name)
}

module.exports = {
  array2Obj,
  breakdownResource,
  capitalize,
  capitalizeFirstCharacter,
  clone,
  isExecutable,
  listDir,
  read,
  readJson,
  removeExtention,
  translateParams,
  writeFiles,
}
