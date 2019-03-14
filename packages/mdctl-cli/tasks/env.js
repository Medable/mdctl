/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      { add } = require('@medable/mdctl-manifest'),
      Environment = require('@medable/mdctl-api/env'),
      { isSet } = require('@medable/mdctl-core-utils/values'),
      Task = require('../lib/task')

class Env extends Task {

  constructor() {
    super({
      format: {
        default: 'json',
        type: 'string'
      },
      manifest: {
        default: '',
        type: 'string'
      },
      gzip: {
        type: 'boolean',
        default: false
      },
      clear: {
        type: 'boolean',
        default: false
      },
      preferUrls: {
        type: 'boolean',
        default: false
      },
      debug: {
        type: 'boolean',
        default: false
      },
      dryRun: {
        type: 'boolean',
        defeault: false
      }
    })
    this.optionKeys = ['manifest', 'format', 'gzip', 'clear', 'dir', 'debug', 'dryRun']
  }

  async run(cli) {

    const arg1 = this.args('1'),
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
    try {
      await Environment.export({ client, ...params })
      console.log('Export finished...!')
    } catch (e) {
      throw e
    }
  }

  async 'env@import'(cli) {
    const client = await cli.getApiClient({ credentials: await cli.getAuthOptions() }),
          params = await cli.getArguments(this.optionKeys)
    try {
      const response = await Environment.import({client, ...params})
      console.log('Import finished...!', response)
    } catch (e) {
      throw e
    }
  }

  async 'env@add'(cli) {
    const params = await cli.getArguments(this.optionKeys),
          options = Object.assign(params, {
            object: this.args('2'),
            type: this.args('3'),
            name: this.args('4')
          })
    await add(options)
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
