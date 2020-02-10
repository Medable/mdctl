const Path = require('path')
const {
  compile,
  TEMPLATES,
} = require('../../../handlebars')
const Util = require('../../../util')

function filterDoclets(taffyDb) {
  // documented, non-package
  return taffyDb({
    kind: {
      '!is': 'package'
    },
    undocumented: {
      isUndefined: true
    }
  }).get()
}

function assembleFiles(doclets, source) {

  const home = Path.resolve(process.cwd(), source),
        homeEnv = Path.join(home, 'env'),
        manifest = Util.readJsonFile(Path.join(home, 'manifest.json')),

        scripts = doclets
          .filter(doclet => doclet.meta.path.endsWith('scripts/js'))
          .reduce((scriptAcc, doclet) => {

            const scriptAccCopy = Object.assign({}, scriptAcc),

                  name = doclet.meta.filename.split('.')[1]

            if (!scriptAccCopy[name]) {
              scriptAccCopy[name] = {}
            }

            if (doclet.script) {
              scriptAccCopy[name].header = doclet
            } else if (doclet.kind === 'function') {

              if (!scriptAccCopy[name].functions) {
                scriptAccCopy[name].functions = []
              }

              scriptAccCopy[name].functions.push(doclet)
            }

            return scriptAccCopy
          }, {}),

        scriptModules = manifest.scripts.includes.map((scriptName) => {

          const meta = Util.readJsonFile(Path.join(homeEnv, 'scripts', `${scriptName}.json`)),

                script = scripts[scriptName],

                name = (script && script.header)
                  ? script.header.script
                  : meta.label || scriptName,

                description = (script && script.header && script.header.description)
                  ? script.header.description
                  : meta.description,

                // create object to hold script functions
                objects = script && script.functions && [
                  {
                    name: 'default',
                    type: 'methods',
                    functions: Util.translateFunctionDoclets(script.functions)
                  }
                ],

                examples = script && script.header && script.header.examples,

                gitbookDescription = script && script.header && script.header.summary

          return {
            description,
            examples,
            gitbookDescription,
            name,
            objects,
            file: scriptName
          }
        }),

        files = scriptModules.map(module => ({
          content: compile(TEMPLATES.MODULE, module),
          name: `${module.file}.md`,
          path: 'scripts'
        }))
  return files
}

function publish(taffyDb, opts) {
  const [source] = opts._,
        doclets = filterDoclets(taffyDb),
        files = assembleFiles(doclets, source)
  Util.writeFiles(files, Path.normalize(opts.destination))
}

module.exports = {
  publish, // required for JSDoc template
}
