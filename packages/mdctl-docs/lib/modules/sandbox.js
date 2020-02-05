const {
  compile,
  TEMPLATES,
} = require('../handlebars')
const Util = require('../util')

const NAME = 'sandbox'

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
    name: `${module.name.toLowerCase()}.md`,
    path: NAME
  }))
  return files
}

const tags = []

module.exports = {
  assembleFiles,
  tags,
}