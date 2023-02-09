const fs = require('fs'),
      path = require('path')

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

function cammelToSentence(s){
  return typeof s === 'string'
    ? s.replace(/([A-Z])/g, match => ` ${match}`).replace(/^./, match => match.toUpperCase())
    : s
}

function removeExtention(s) {
  return typeof s === 'string'
    ? s.replace(/\.[^/.]+$/, '')
    : s
}

function capitalize(s) {
  return typeof s === 'string'
    ? s.toUpperCase()
    : s
}

function stringify(value, replacer, space) {
  let stringified = ''
  try {
    stringified = JSON.stringify(value, replacer, space)
  } catch(err) {
    console.warn(err)
  }
  return stringified
}

/**
 * Object
 */
function clone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

function isObject(obj){
  return Object.prototype.toString.call(obj) === '[object Object]'
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

/**
 * Files
 */

function read(file, encoding = 'utf8') {
  return fs.readFileSync(file, encoding)
}

function listFiles(directory){
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((dirent) => dirent.isFile())
    .map((dirent) => path.join(directory, dirent.name))
}

function readJson(path, empty = {}) {
  try {
    return JSON.parse(fs.readFileSync(path))
  } catch (err) {
    console.warn(`Unable to read ${path}`)
    return empty
  }
}

function writeFiles(files, destination) {
  for (file of files){
    writeFile(file, destination)
  }
}

function writeFile(file, destination) {

  const directory = path.join(destination, file.path),
        filePath = path.join(directory, file.name)

  console.log(`Writing: ${filePath}`)

  ensureDir(directory)
  fs.writeFileSync(filePath, file.content)
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

module.exports = {
  array2Obj,
  capitalize,
  capitalizeFirstCharacter,
  cammelToSentence,
  clone,
  isObject,
  read,
  listFiles,
  readJson,
  removeExtention,
  stringify,
  writeFiles,
  writeFile
}
