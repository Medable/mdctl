/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      fs = require('fs'),
      Environment = require('../../lib/env'),
      { isSet, parseString } = require('../../lib/utils/values'),
      Task = require('../lib/task'),
      { templates } = require('../../lib/schemas'),
      { Manifest } = require('../../lib/manifest')

class Env extends Task {

  constructor() {
    super()
    this.optionKeys = ['manifest', 'format', 'layout', 'dir']
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
    const client = await cli.getApiClient({ credentials: await cli.getAuthOptions() })
    await Environment.export({ client })
    console.log('Export finished...!')
  }

  async 'env@import'(cli) {
    const client = await cli.getApiClient({ credentials: await cli.getAuthOptions() })
    await Environment.import({ client })
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
    `
  }

}

module.exports = Env
