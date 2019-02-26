/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      Environment = require('mdctl-env'),
      { isSet } = require('mdctl-core-utils/values'),
      Task = require('../lib/task')

class Env extends Task {

  constructor() {
    super()
    this.optionKeys = ['manifest', 'format', 'clear', 'dir', 'preferUrls', 'silent']
  }

  async run(cli) {

    const arg1 = cli.args('1'),
          handler = `env@${arg1}`

    if (!isSet(arg1)) {
      return console.log(Env.help(cli))
    }

    if (!_.isFunction(this[handler])) {
      throw new Error('Invalid command')
    }
    return this[handler](cli)
  }

  async 'env@export'(cli) {
    const client = await cli.getApiClient({ credentials: await cli.getAuthOptions() }),
          params = await cli.getArguments(this.optionKeys)
    await Environment.export({ client, ...params })
    console.log('Export finished...!')
  }

  async 'env@import'(cli) {
    const client = await cli.getApiClient({ credentials: await cli.getAuthOptions() }),
          params = await cli.getArguments(this.optionKeys)
    await Environment.import({ client, ...params })
    console.log('Import finished...!')
  }

  async 'env@add'(cli) {
    const params = await cli.getArguments(this.optionKeys),
          options = Object.assign(params, {
            object: cli.args('2'),
            type: cli.args('3'),
            name: cli.args('4')
          })
    await Environment.add(options)
    console.log('Resource added...!')
  }

  // ----------------------------------------------------------------------------------------------

  static get synopsis() {
    return 'environment tools'
  }

  static help() {

    return `    
      Environment environment tools.
      
      Usage: 
        
        mdctl env [command] [options]
            
      Arguments:               
        
        command                      
          export - export from an endpoint environment        
          import - import to an endpoint environment   
          add object [type] name - add a new resource      
                  
        options     
          --endpoint sets the endpoint. eg. api.dev.medable.com     
          --env sets the environment. eg. example                              
          --manifest - defaults to $cwd/manifest.json
          --format - export format (json, yaml) defaults to json
          --clear - export will clear output dir before export default true
          --preferUrls - set to true to force the server to send urls instead of base64 encoded chunks 
          --silent - skip documents with mssing export keys instead of failing
                                  
    `
  }

}

module.exports = Env
