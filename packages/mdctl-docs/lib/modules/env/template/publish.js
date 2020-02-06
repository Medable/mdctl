const Path = require('path')
const {
  compile,
  TEMPLATES,
} = require('../../../handlebars')
const Util = require('../../../util')

function filterDoclets(taffyDb){
  // documented, non-package
  return taffyDb({
    kind: {
      '!is':'package'
    },
    undocumented: {
      isUndefined: true
    }
  }).get()
}

function assembleFiles(doclets){

  const module = {}
  for(const doclet of doclets){
    // assemble module
  }

  const files = [
    {
      content: compile(TEMPLATES.MODULE, module),
      name: `${module.name.toLowerCase()}.md`,
    }
  ]

  return files
}

function publish(taffyDb, opts, tutorials){
  const doclets = filterDoclets(taffyDb)
  const files = assembleFiles(doclets)
  Util.writeFiles(files, Path.normalize(opts.destination))
}

module.exports = {
  publish, // required for JSDoc template
}