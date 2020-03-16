const { spawn } = require('child_process'),
      Path = require('path'),
      jsdoc = Path.join(__dirname, '../../../../..', '.bin', 'jsdoc')

function getAst(options) {
  return new Promise((resolve, reject) => {
    const params = [
      options.source,
      '--recurse',
      '--configure', Path.join(__dirname, 'config.json'),
      '--explain' // Dump all doclets to the console in JSON format, then exit.
    ]

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
      proc.stderr.on('data', console.log)
      proc.on('close', () => {
        resolve(JSON.parse(result.join('')))
      })
    } catch (err) {
      reject(err)
    }
  })
}

module.exports = getAst
