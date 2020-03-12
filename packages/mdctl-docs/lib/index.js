const { execSync } = require('child_process')
const Path = require('path')

const jsdoc = Path.join(__dirname, '..', 'node_modules', '.bin', 'jsdoc')

const OPTIONS_DEFAULT = Object.freeze({
  destination: 'docs',
  source: '.',
  verbose: false,
})

function generateDocumentation(options){

  options = Object.assign({}, OPTIONS_DEFAULT, options)

  const params = [
    jsdoc,
    options.source,
    '-r', // recursive
    '-d', options.destination,
  ]

  if(options.module){
    const config = Path.join(__dirname, 'modules', options.module, 'config.json')
    const template = Path.join(__dirname, 'modules', options.module, 'template')
    params.push('-c', config, '-t', template)
  }

  const command = params.join(' ')
  const stdout = execSync(command)
  options.verbose && console.log(stdout.toString())
  return true
}

module.exports = {
  generateDocumentation,
}