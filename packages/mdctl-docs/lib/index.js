const { execSync } = require('child_process')
const Path = require('path'),
      jsdoc = Path.join(__dirname, '..', 'node_modules', '.bin', 'jsdoc')

function generateDocumentation(opts) {

  const options = Object.assign({}, this.generateDocumentation.default, opts),

        {
          destination,
          module,
          source,
          verbose,
        } = options,

        params = [
          jsdoc,
          source,
          '-r', // recursive
          '-d', destination,
          '-c', Path.join(__dirname, 'config.js')
        ]

  if (module) {
    const parts = Path.parse(module),
          modulePath = !parts.dir
            ? Path.join(__dirname, 'modules', module) // is name
            : module, // is path
          // eslint-disable-next-line global-require, import/no-dynamic-require
          moduleObj = require(modulePath)

    if (moduleObj.template) {
      params.push('-t', 'template')
    }
    if (moduleObj.plugin) {
      params.push('-c', Path.join(__dirname, 'config.json'))
    }

    params.push('-q', `module=${modulePath}`)
  }

  if (verbose) {
    params.push('--verbose')
  }

  console.log(execSync(params.join(' ')).toString())
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
