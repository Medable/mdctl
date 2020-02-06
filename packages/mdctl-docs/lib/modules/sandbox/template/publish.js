const Path = require('path')
const {
  compile,
  TEMPLATES,
} = require('../../../handlebars')
const Util = require('../../../util')

function assembleFiles(taffyDb){

  // documented, non-package
  const doclets = taffyDb({
    kind: {
      '!is':'package'
    },
    undocumented: {
      isUndefined: true
    }
  }).get()

  const modules = {}
  for(const doclet of doclets){
    // console.log(doclet)
  }

  const files = Object.values(modules).map(module => ({
    content: compile(TEMPLATES.MODULE, module),
    name: `${module.name.toLowerCase()}.md`
  }))
  return files
}

function publish(taffyDb, opts, tutorials){
  const files = assembleFiles(taffyDb)
  Util.writeFiles(files, Path.normalize(opts.destination))
}

module.exports = {
  publish, // required for JSDoc template
}