const { execSync } = require('child_process'),
      Path = require('path'),
      Util = require('./util'),
      jsdoc = Path.join(__dirname, '..', 'node_modules', '.bin', 'jsdoc')

function generateDocumentation(opts) {

  const options = Object.assign({}, this.generateDocumentation.default, opts),

        {
          debug,
          destination,
          errors,
          log,
          module,
          source,
          verbose,
        } = options,

        projectConfig = Util.readJson('./config.json'),
        projectConfigDocsModule = projectConfig && projectConfig.docs && projectConfig.docs.module,
        resolvedModule = module || projectConfigDocsModule,

        params = [
          jsdoc,
          source,
          '--recurse',
          '--destination', destination,
        ]

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

  const execOpts = {}
  if (log || verbose || debug || errors) {
    // send output to this process
    execOpts.stdio = 'inherit'
  }

  if(!errors){
    // jsdoc considers parsing errors as fatal which can confound the output
    params.push('2>/dev/null')
  }

  try {
    execSync(params.join(' '), execOpts)
  }
  catch(err){
    if(!errors){
      console.warn('JSDoc errors detected. To output the errors, please include the --errors flag')
    }
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
}
