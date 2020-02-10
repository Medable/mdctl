const Fs = require('fs')
const Path = require('path')

/**
 * String
 */
function capitalizeFirstCharacter(s) {
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}`
}

/**
 * Files
 */
function writeFiles(files, location) {
  for (let i = 0; i < files.length; i += 1) {
    writeFile(files[i], location)
  }
  console.log(`finished generating documentation in ${location}`)
}

function writeFile(file, location) {
  const {
          content,
          name,
          path,
        } = file,
        filePath = path ? Path.join(location, path) : location,
        fileLocation = Path.join(filePath, name)
  ensureDir(filePath)
  Fs.writeFileSync(fileLocation, content)
}

function ensureDir(directory) {
  const folders = directory.split('/')
  if (directory.startsWith('/')) {
    folders[0] = '/'
  }
  let path = '',
      folder = folders.shift()
  while (folder) {
    path = Path.join(path, folder)
    if (!Fs.existsSync(path)) {
      Fs.mkdirSync(path)
    }
    folder = folders.shift()
  }
}

function readJsonFile(path) {
  return JSON.parse(Fs.readFileSync(path))
}

/**
 * Template
 */
function findParam(params, name) {
  return params.find(param => param.name === name)
}

function addChild(paramList, param, uri) {

  const uriCopy = uri.slice(0)

  let params = paramList,
      name = uriCopy.shift()
  while (name) {
    if (uriCopy.length === 0) {
      params.push({
        name,
        typeString: param.type
          ? param.type.names.join('|')
          : undefined,
        description: param.description,
        children: []
      })
    } else {
      const target = findParam(params, name)
      if (!target) {
        break
      }
      params = target.children
    }
    name = uriCopy.shift()
  }
}

function reduceParams(jsdocParams, schema, defaultType = 'arg') {
  return jsdocParams.length ? jsdocParams.reduce((params, param) => {
    const parts = param.name.split('.'),
          uri = parts.slice(1, parts.length)
    let type = parts[0]
    if (uri.length === 0) {
      type = defaultType
      uri.push(parts[0])
    }
    addChild(params[type], param, uri)
    return params
  }, schema) : undefined
}

function reduceParamString(params) {
  return params.filter(param => param.name.startsWith('arg')).reduce((paramNames, param) => {
    const name = param.name.split('.')[1]
    if (!paramNames.includes(name)) {
      paramNames.push(name)
    }
    return paramNames
  }, []).join(', ')
}

function translateFunctionDoclets(doclets) {
  return doclets.map(doclet => ({
    description: doclet.description,
    name: doclet.name,
    paramString: doclet.params && reduceParamString(doclet.params),
    params: doclet.params && reduceParams(doclet.params, {
      arg: [],
      return: []
    })
  }))
}

module.exports = {
  capitalizeFirstCharacter,
  readJsonFile,
  reduceParams,
  reduceParamString,
  translateFunctionDoclets,
  writeFiles,
}
