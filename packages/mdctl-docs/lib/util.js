const Fs = require('fs')
const Path = require('path')

/**
 * String
 */
function capitalizeFirstCharacter(s){
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}`
}

/**
 * Object
 */
function ensureObjValue(obj, name){
  if(!obj[name]){
    obj[name] = {}
  }
}

function ensureArrayValue(obj, name){
  if(!obj[name]){
    obj[name] = []
  }
}

/**
 * Write
 */
function writeFiles(files, location){
  for(let i = 0; i < files.length; i++){
    writeFile(files[i], location)
  }
  console.log(`finished generating documentation in ${location}`)
}

function writeFile(file, location){
  const {
    content,
    name,
    path,
  } = file
  const filePath = path ? Path.join(location, path) : location
  const fileLocation = Path.join(filePath, name)
  ensureDir(filePath)
  Fs.writeFileSync(fileLocation, content)
}

function ensureDir(directory){
  const folders = directory.split('/')
  let path = ''
  while(folder = folders.shift()){
    path = Path.join(path, folder)
    if(!Fs.existsSync(path)){
      Fs.mkdirSync(path)
    }
  }
}

/**
 * Template
 */
function addChild(paramList, param, uri){

  const uriCopy = uri.slice(0)

  let params = paramList
  while(name = uriCopy.shift()){
    if(uriCopy.length === 0){
      params.push({
        name,
        typeString: param.type
          ? param.type.names.join('|')
          : undefined,
        description: param.description,
        children: []
      })
    }
    else {
      const target = params.find(param => param.name === name)
      if(!target){
        break
      }
      params = target.children
    }
  }
}

function reduceParams(params, schema, defaultType='arg'){
  return params.length ? params.reduce((params, param) => {
    const parts = param.name.split('.')
    let [
      type,
      ...uri
    ] = parts
    if(uri.length === 0){
      type = defaultType
      uri.push(parts[0])
    }
    addChild(params[type], param, uri)
    return params
  }, schema) : undefined
}

function reduceParamString(params){
  return params.filter(param => param.name.startsWith('arg')).reduce((paramNames, param) => {
    const name = param.name.split('.')[1]
    !paramNames.includes(name) && paramNames.push(name)
    return paramNames
  }, []).join(', ')
}

function translateFunctionDoclets(doclets){
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
  ensureObjValue,
  ensureArrayValue,
  reduceParams,
  reduceParamString,
  translateFunctionDoclets,
  writeFiles,
}