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

function assembleFiles(doclets, source){

  const home = Path.resolve(process.cwd(), source)
  const manifest = require(Path.join(home, '..', 'manifest.json'))
  const environment = require(Path.join(home, 'env.json'))

  const scripts = doclets
    .filter(doclet => doclet.meta.path.endsWith('scripts/js'))
    .reduce((scripts, doclet) => {

      const name = doclet.meta.filename.split('.')[1]

      Util.ensureObjValue(scripts, name)

      if(!!doclet.script){
        scripts[name].header = doclet
      }
      else if(doclet.kind === 'function'){
        Util.ensureArrayValue(scripts[name], 'functions')
        scripts[name].functions.push(doclet)
      }

      return scripts
    }, {})

  const scriptModules = manifest.scripts.includes.map(scriptName => {

    const meta = require(Path.join(home, 'scripts', `${scriptName}.json`))

    const script = scripts[scriptName]

    const name = (script && script.header)
      ? script.header.script
      : meta.label || scriptName

    const description = (script && script.header && script.header.description)
      ? script.header.description
      : meta.description

    // create object to hold script functions
    const objects = script && script.functions && [
      {
        name: 'default',
        type: 'methods',
        functions: Util.translateFunctionDoclets(script.functions)
      }
    ]

    const examples = script && script.header && script.header.examples

    const gitbookDescription = script && script.header && script.header.summary

    return {
      description,
      examples,
      gitbookDescription,
      name,
      objects,
      file: scriptName
    }
  })

  const files = scriptModules.map(module => ({
    content: compile(TEMPLATES.MODULE, module),
    name: `${module.file}.md`,
    path: 'scripts'
  }))
  return files
}

function publish(taffyDb, opts, tutorials){
  const [ source ] = opts._
  const doclets = filterDoclets(taffyDb)
  const files = assembleFiles(doclets, source)
  Util.writeFiles(files, Path.normalize(opts.destination))
}

module.exports = {
  publish, // required for JSDoc template
}