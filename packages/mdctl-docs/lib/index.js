const { execSync } = require('child_process')
const Path = require('path')

function generateDocumentation(source='.'){
  const jsdocPath = Path.join(__dirname, '..', 'node_modules', '.bin', 'jsdoc')
  const configPath = Path.join(__dirname, 'config.js')
  const command = `${jsdocPath}${source ? ` ${source}` : '' } -c ${configPath}`
  const stdout = execSync(command)
  console.log(stdout.toString())
  return true
}

module.exports = {
  generateDocumentation,
}