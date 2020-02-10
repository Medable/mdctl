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
        ]

  if (module) {
    const config = Path.join(__dirname, 'modules', module, 'config.json'),
          template = Path.join(__dirname, 'modules', module, 'template')
    params.push('-c', config, '-t', template)
  }

  if (verbose) {
    params.push('--verbose')
  }

  const stdout = execSync(params.join(' ')) // eslint-disable-line one-var
  if (verbose) {
    console.log(stdout.toString())
  }
  return true
}

generateDocumentation.default = Object.assign({
  destination: 'docs',
  source: '.',
  verbose: false,
})

module.exports = {
  generateDocumentation,
}
