const Path = require('path'),
      Util = require('./util'),
      Handlebars = require('./handlebars'),
      Parsers = require('./parsers'),
      Modules = require('./modules')

async function extractAst(options, parser = 'jsdoc') {
  if (Object.keys(Parsers).includes(parser)) {
    return Parsers[parser](options)
  }
  throw new Error('Unknown parser')
}

function loadModule(module) {
  const isPath = !!Path.parse(module).dir
  if (isPath) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(module)
  }
  if (Object.keys(Modules).includes(module)) {
    return Modules[module]
  }

  throw new Error('Unknown module')

}

async function generateDocumentation(opts) {

  const options = Object.assign({}, this.generateDocumentation.default, opts),

        config = Util.readJson(Path.join(process.cwd(), 'config.json')),
        configModule = config
          && config.docs
          && config.docs.module
          && Path.join(process.cwd(), config.docs.module),
        resolvedModule = options.module || configModule

  if (resolvedModule) {
    const moduleObj = loadModule(resolvedModule),
          ast = await extractAst(options, moduleObj.parser),
          result = moduleObj.generate(ast, options)

    console.log('Finished generating documentation')
    return result
  }

  throw new Error('Module not specified')

}

generateDocumentation.default = Object.freeze({
  destination: 'docs',
  source: '.',
  verbose: false,
})

module.exports = {
  generateDocumentation,
  Handlebars,
  Util
}
