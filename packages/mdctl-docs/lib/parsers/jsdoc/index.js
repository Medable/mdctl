const { spawn } = require('child_process'),
      path = require('path'),
      util = require('../../util')

function locateJsdoc() {

  let location = __dirname,
      jsdoc

  while (location) {
    const jsdocPathPotential = path.join(location, 'node_modules', '.bin', 'jsdoc')
    if (!jsdoc && util.isExecutable(jsdocPathPotential)) {
      jsdoc = jsdocPathPotential
    }
    location = location.substr(0, location.lastIndexOf('/'))
  }

  if (!jsdoc) {
    throw new Error('Unable to find JSDoc executable')
  }

  return jsdoc
}

function getAst(options) {
  return new Promise((resolve, reject) => {
    const params = [
            options.source,
            '--recurse',
            '--configure', path.join(__dirname, 'config.json'),
            '--explain' // Dump all doclets to the console in JSON format, then exit.
          ],
          jsdoc = locateJsdoc()

    // FIXME: These are currently not compatible with --explain
    // if (options.verbose) {
    //   params.push('--verbose')
    // }
    // if (options.debug) {
    //   params.push('--debug')
    // }

    try {
      const result = [],
            proc = spawn(jsdoc, params, { encoding: 'utf8' })
      proc.stdout.on('data', (data) => {
        result.push(data.toString('utf8'))
      })
      proc.stderr.on('data', (data) => {
        console.log(data.toString('utf8'))
      })
      proc.on('close', () => {
        resolve(JSON.parse(result.join('')))
      })
    } catch (err) {
      reject(err)
    }
  })
}

module.exports = getAst
