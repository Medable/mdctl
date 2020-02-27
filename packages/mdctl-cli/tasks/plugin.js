/* eslint-disable class-methods-use-this */

const {
        isSet, stringToBoolean, rArray
      } = require('@medable/mdctl-core-utils/values'),
      { Fault } = require('@medable/mdctl-core'),
      Task = require('../lib/task')

let Undefined

class Plugin extends Task {

  static get taskNames() {
    return ['plugin']
  }

  async createTask(cli, task, argOffset = 0) {

    const createOptions = async() => {

            const options = {
              client: await cli.getApiClient({ credentials: await cli.getAuthOptions() })
            }
            this.applyArgIf(options, 'strictSSL')
            if (isSet(options.strictSSL)) {
              options.client.setRequestOption('strictSSL', stringToBoolean(options.strictSSL))
            }
            return options
          },
          format = this.args('format') || 'json',
          outputResult = (data) => {
            const formatted = Plugin.formatOutput(data, format),
                  isError = data && data.object === 'fault'

            if (isError) {
              console.error(formatted)
            } else {
              console.log(formatted)
            }
          },

          { client } = await createOptions()

    let remote

    if (task === Undefined || task.indexOf('--') === 0) {

      return class extends Task {

        async run() {

          let err,
              result,
              output

          try {
            result = await client.get('/routes/mdctl')
          } catch (e) {

            err = e
          }

          if (err) {
            output = err.toJSON()
          } else {
            output = result
          }
          if (output !== Undefined) {
            outputResult(output)
          }

          return true

        }

      }

    }

    try {
      remote = await client.get(`/routes/mdctl/${task}`)
    } catch (err) {
      return null
    }

    if (remote) {

      return class extends Task {

        async run() {

          let err,
              result,
              output

          try {

            const command = this.args(String(argOffset + 1)),
                  entry = remote.commands.find(v => v.name === command)

            if (command === Undefined || command.indexOf('--') === 0) {

              result = remote

            } else if (!entry) {

              err = Fault.create('mdctl.notFound.command', { reason: 'Command not found.', resource: `${task}.${command}` })

            } else {

              const args = [],
                    input = await new Promise((resolve) => {
                      const { stdin } = process
                      let data = ''
                      if (stdin.isTTY) {
                        resolve(Undefined)
                      } else {
                        stdin.resume()
                        stdin.setEncoding('utf8')
                        stdin.on('data', (chunk) => {
                          data += chunk
                        })
                        stdin.on('end', () => {
                          resolve(data)
                        })
                      }
                    })

              if (input !== Undefined) {
                args.push(...rArray(JSON.parse(input), true))
              }

              let index = argOffset + 2,
                  done = false

              while (!done) {

                const value = this.args(String(index))
                index += 1
                if (value === Undefined || value.indexOf('--') === 0) {
                  done = true
                } else {
                  try {
                    args.push(JSON.parse(value))
                  } catch(err) {
                    args.push(value) // forgiving, send as string
                  }

                }
              }

              result = await client.post(`/routes/mdctl/${task}/${command}`, args)

            }

          } catch (e) {

            err = e
          }

          if (err) {
            output = err.toJSON()
          } else {
            output = result
          }
          if (output !== Undefined) {
            outputResult(output)
          }

          return true

        }

      }

    }

    return null

  }

  async run(cli) {

    // run directly, args are offset by 1
    const PluginClass = await this.createTask(cli, this.args('1'), 1),
          plugin = new PluginClass()
    return plugin.run(cli)


  }


  // ----------------------------------------------------------------------------------------------

  static get synopsis() {
    return 'remote plugin'
  }

  static help() {

    return `    
    Remote Plugin
    
    Usage: 
      
      mdctl plugin [name] [command] [...args] --format --strictSSL       
          
    Arguments:                          
                                                                        
        --format - output format. defaults to json (json, pretty, yaml, raw)
        --strictSSL                                                                                                               
    `
  }

}

module.exports = Plugin
