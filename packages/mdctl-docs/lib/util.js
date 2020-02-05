const Fs = require('fs')
const Path = require('path')

/**
 * String
 */
function capitalizeFirstCharacter(s){
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}`
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
  const filePath = Path.join(location, path)
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

function reduceParams(params, schema){
  return params.reduce((params, param) => {
    const parts = param.name.split('.')
    const [
      type,
      ...uri
    ] = parts
    addChild(params[type], param, uri)
    return params
  }, schema)
}

function reduceParamString(params){
  return params.filter(param => param.name.startsWith('arg')).reduce((paramNames, param) => {
    const name = param.name.split('.')[1]
    !paramNames.includes(name) && paramNames.push(name)
    return paramNames
  }, []).join(', ')
}

module.exports = {
  capitalizeFirstCharacter,
  reduceParams,
  reduceParamString,
  writeFiles,
}