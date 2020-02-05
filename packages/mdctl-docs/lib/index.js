const { execSync } = require('child_process')
const Path = require('path')

function generateDocumentation(){
  const configPath = Path.join(__dirname, 'config.js')
  const command = `jsdoc lib -c ${configPath}`
  const stdout = execSync(command)
  console.log(stdout.toString())
  return true
}

module.exports = {
  generateDocumentation,
}