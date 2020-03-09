const { execSync } = require('child_process'),
      Path = require('path'),
      jsdoc = Path.join(__dirname, '../../..', 'node_modules', '.bin', 'jsdoc')

function getAst(options) {
  const params = [
    jsdoc,
    options.source,
    '--recurse',
    '--configure', Path.join(__dirname, 'config.json'),
    '--explain' // Dump all doclets to the console in JSON format, then exit.
  ]

  if (options.verbose) {
    params.push('--verbose')
  }

  if (options.debug) {
    params.push('--debug')
  }

  try {
    return JSON.parse(execSync(params.join(' '), { encoding: 'utf8' }))
  } catch (err) {
    throw new Error('JSDoc execution failed. Failed to obtain ast')
  }
}

module.exports = getAst
