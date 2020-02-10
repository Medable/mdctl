const { execSync } = require('child_process')
const Path = require('path')

const jsdoc = Path.join(__dirname, '..', 'node_modules', '.bin', 'jsdoc')

function generateDocumentation(options){

  options = Object.assign({}, this.generateDocumentation.default, options)

  const {
    destination,
    module,
    source,
    verbose,
  } = options

  const params = [
    jsdoc,
    source,
    '-r', // recursive
    '-d', destination,
  ]

  if(module){
    const config = Path.join(__dirname, 'modules', module, 'config.json')
    const template = Path.join(__dirname, 'modules', module, 'template')
    params.push('-c', config, '-t', template)
  }

  if(verbose){
    params.push('--verbose')
  }

  const command = params.join(' ')
  const stdout = execSync(command)
  verbose && console.log(stdout.toString())
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