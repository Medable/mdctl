const { execSync } = require('child_process'),
      Path = require('path'),
      Util = require('./util'),
      Handlebars = require('./handlebars'),
      jsdoc = Path.join(__dirname, '..', 'node_modules', '.bin', 'jsdoc')

function generateDocumentation(opts) {

  const options = Object.assign({}, this.generateDocumentation.default, opts),

        {
          debug,
          destination,
          log,
          module,
          source,
          verbose,
        } = options,

        projectConfig = Util.readJson(Path.join(process.cwd(), 'config.json')),
        projectConfigDocsModule = projectConfig
          && projectConfig.docs
          && projectConfig.docs.module
          && Path.join(process.cwd(), projectConfig.docs.module),
        resolvedModule = module || projectConfigDocsModule,

        params = [
          jsdoc,
          source,
          '--recurse',
          '--destination', destination,
        ],

        execOpts = {}

  if (resolvedModule) {
    const parts = Path.parse(resolvedModule),
          modulePath = !parts.dir
            ? Path.join(__dirname, 'modules', resolvedModule) // is name
            : resolvedModule, // is path
          // eslint-disable-next-line global-require, import/no-dynamic-require
          moduleObj = require(modulePath)

    if (moduleObj.template) {
      params.push('--template', 'template')
    }
    if (moduleObj.plugin) {
      params.push('--configure', Path.join(__dirname, 'config.json'))
    }

    params.push('--query', `module=${modulePath}`)
    console.log(`Using module ${parts.name}`)
  }

  if (verbose) {
    params.push('--verbose')
  }

  if (debug) {
    params.push('--debug')
  }

  if (log || verbose || debug) {
    // send output to this process
    execOpts.stdio = 'inherit'
  }

  try {
    // TODO: If JSDoc throws an error (syntax or runtime), it is still
    //       being outputted to the console
    execSync(params.join(' '), execOpts)
  } catch (err) {
    console.warn('JSDoc errors detected')
  }

  console.log('finished generating documentation')
  return true
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
