const Fs = require('fs')
const Path = require('path')

/**
 * String
 */
function capitalizeFirstCharacter(s) {
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}`
}

/**
 * Object
 */
function clone(obj){
  return JSON.parse(JSON.stringify(obj))
}

function breakdownResource(resource, level=1){
  let sets = [],
    resources = [],
    properties = []
  for (let [key, value] of Object.entries(resource)) {
    if(value !== null){
      if(typeof value === 'object'){
        if(Array.isArray(value)){
          // new object array
          if(['[object Object]', '[object Array]'].includes(Object.prototype.toString.call(value[0]))){
            resources.push({
              label: key,
              level: level + 1,
              resources: value.map(resource => breakdownResource(resource, level + 2))
            })
          }
          // key/set(primitives)
          else if(!(value[0] == null)){
            sets.push({ key, value })
          }
        }
        // new object
        else {
          resources.push({
            label: key,
            level: level + 1,
            resources: [breakdownResource(value, level + 2)]
          })
        }
      }
      // key/primitive
      else if(key !== 'label') {
        properties.push({ key, value })
      }
    }
  }

  const label = resource.label
    || resource.name
    || 'Item'

  return {
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
function compareParams(a, b){
  const nameA = a.name.toLowerCase()
  const nameB = b.name.toLowerCase()
  if (nameA < nameB) {
    return -1
  }
  if (nameA > nameB) {
    return 1
  }
  return 0
}

function translateParams(params){
  return params
    .sort(compareParams)
    .reduce((params, param) => {
      const uri = param.name.split('.')

      let list = params,
          name = uri.shift()
      while(name){
        if(uri.length === 0){
          list.push({
            name,
            typeString: param.type
              ? param.type.names.join('|')
              : undefined,
            description: param.description,
            children: []
          })
        }
        else {
          const target = findParam(list, name)
          if (!target) {
            break
          }
          list = target.children
        }
        name = uri.shift()
      }
      return params
    }, [])
}

function findParam(params, name) {
  return params.find(param => param.name === name)
}

function defineSection(label, resources=[], level=1){
  return {
    label,
    level,
    resources: resources.map(resource => breakdownResource(resource, level))
  }
}

module.exports = {
  breakdownResource,
  capitalizeFirstCharacter,
  clone,
  defineSection,
  readJsonFile,
  translateParams,
  writeFiles,
}
