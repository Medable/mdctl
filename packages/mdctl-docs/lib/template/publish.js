const Fs = require('fs')
const Path = require('path')
const {
  compile,
  TEMPLATES,
} = require('../handlebars')
const Util = require('../util')
const Modules = require('../modules')

function publish(taffyDb, opts, tutorials){
  const files = Object.values(Modules).reduce((files, module) => {
    files.push(...module.assembleFiles(taffyDb))
    return files
  }, [])
  Util.writeFiles(files, Path.normalize(env.opts.destination))
}

module.exports = {
  publish, // required for JSDoc template
}