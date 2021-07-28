const path = require('path'),
      util = require('./util'),
      handlebars = require('./handlebars'),
      parsers = require('./parsers'),
      modules = require('./modules')

async function extractAst(options, parser = 'jsdoc') {
  if (Object.keys(parsers).includes(parser)) {
    return parsers[parser](options)
  }
  throw new Error('Unknown parser')
}

function loadModule(module) {
  const isPath = !!path.parse(module).dir
  if (isPath) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(module)
  }
  if (Object.keys(modules).includes(module)) {
    return modules[module]
  }

  throw new Error('Unknown module')

}

async function generateDocumentation(opts) {

  console.log('generateDocumentation', opts)

  const options = Object.assign({}, this.generateDocumentation.default, opts),

        config = util.readJson(path.join(process.cwd(), 'config.json')),
        configModule = config
          && config.docs
          && config.docs.module
          && path.join(process.cwd(), config.docs.module),
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
  handlebars,
  util
}
