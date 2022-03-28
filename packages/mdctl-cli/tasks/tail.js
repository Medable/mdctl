/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      {
        rString, isSet, stringToBoolean, isString
      } = require('@medable/mdctl-core-utils/values'),
      ndjson = require('ndjson'),
      async = require('async'),
      { pathTo } = require('@medable/mdctl-core-utils'),
      sandbox = require('@medable/mdctl-sandbox'),
      { Fault } = require('@medable/mdctl-core'),
      Task = require('../lib/task')

class Tail extends Task {

  static get taskNames() {

    return ['tail']

  }

  async run(cli) {

    const createOptions = async() => {

            function discernSource(source) {
              if (!isString(source) || source.indexOf('--') === 0) {
                return 'console'
              }
              return rString(source, 'console')
            }

            const options = {
              client: await cli.getApiClient({ credentials: await cli.getAuthOptions() }),
              stats: false,
              script: `return sys.tail('${discernSource(this.args('1'))}')`,
              stream: ndjson.parse()
            }

            this.applyArgIf(options, 'strictSSL')

            if (isSet(options.strictSSL)) {
              options.client.setRequestOption('strictSSL', stringToBoolean(options.strictSSL))
            }
            pathTo(options, 'requestOptions.headers.accept', 'application/x-ndjson')

            return options
          },
          format = this.args('format') || 'json',
          outputResult = (data) => {
            const formatted = Tail.formatOutput(data, format),
                  isError = data && data.object === 'fault'

            if (isError) {
              console.error(formatted)
            } else {
              console.log(formatted)
            }
          }

    async function run() {

      let restart = true

      async function tail() {

        let handled = false

        restart = false

        const options = await createOptions(),
              { client } = options,
              stream = await sandbox.run(options),
              { response } = client

        return new Promise((resolve) => {

          stream.on('data', (data) => {
            if (pathTo(data, 'object') === 'fault') {
              const err = Fault.from(data)
              if (err.errCode === 'cortex.error.aborted') {
                restart = true
              } else {
                outputResult(err.toJSON())
              }
            } else if (pathTo(data, 'object') === 'result') {
              outputResult(data.data)
            } else {
              outputResult(data)
            }
          })

          stream.on('error', (error) => {
            if (handled) {
              return
            }
            handled = true
            if (response.status >= 500) {
              restart = true
            } else {
              outputResult(Fault.from(error).toJSON())
            }
            resolve()

          })

          stream.on('end', () => {
            if (handled) {
              return
            }
            handled = true
            if (response.status === 200) {
              restart = true
            }
            resolve()
          })

        })
      }

      return new Promise((resolve, reject) => {

        let tries = 0

        const maxTries = 20,
              maxTimeout = 10000,
              timeout = () => Math.min(maxTimeout, (50 * (2 ** tries)))

        async.whilst(
          () => restart,
          (callback) => {

            tail()
              .then(() => {

                if (restart) {
                  tries = 0
                }
                callback()

              })
              .catch((err) => {

                if (tries < maxTries && ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(err.code)) {

                  restart = true
                  setTimeout(callback, timeout())
                  tries += 1

                } else {

                  outputResult(Fault.from(err).toJSON())
                  callback()

                }

              })

          },
          (err) => {
            if (err) {
              reject(err)
            } else {
              resolve(true)
            }
          }
        )

      })

    }

    return run()

  }

  mergeJsonArgIf(options, arg) {

    const value = this.args(arg)
    if (rString(value)) {
      const parsed = JSON.parse(value)
      options[arg] = _.merge(options[arg], parsed) // eslint-disable-line no-param-reassign
    }
  }

  applyArgIf(options, arg) {
    const value = this.args(arg)
    if (isSet(value)) {
      options[arg] = value // eslint-disable-line no-param-reassign
    }
  }

  // ----------------------------------------------------------------------------------------------

  static get synopsis() {
    return 'log tail'
  }

  static help() {

    return `    
    Tail Logs
    
    Usage: 
      
      mdctl tail [source] --format --strictSSL       
          
    Arguments:               
      
      Command 
                                     
        source - the log source (defaults to console)                               
                
      Options 
                                                                        
        --format - output format. defaults to json (json, pretty, yaml, raw)
        --strictSSL                                                                                                               
    `
  }

}

module.exports = Tail
