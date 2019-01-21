/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      { isSet } = require('../../lib/utils/values'),
      Task = require('../lib/task')

class Dev extends Task {

  async run(cli) {

    const arg2 = cli.args('2'),
          handler = `${cli.args('1')}@${arg2}`

    if (!isSet(arg2)) {
      return console.log(Dev.help(cli))
    }

    if (!_.isFunction(this[handler])) {
      throw new Error('Invalid command')
    }
    return this[handler](cli)
  }

  async 'env@export'() {

    console.log('mdctl dev env export')
  }

  async 'env@import'() {

    console.log('mdctl dev env import')
  }

  // ----------------------------------------------------------------------------------------------

  static get synopsis() {
    return 'developer tools'
  }

  static help(cli) {

    const command = cli.args('2') || cli.args('1')

    switch (command) {
      case 'env': return this.envHelp()
      default:
    }

    return `    
    Developer tools.
    
    Usage: 
      
      mdctl dev [command] [options]
          
    Arguments:               
      
      command                
        env - environment tools         
                
      options                           
        --quiet - suppress confirmations                        
    `
  }

  static envHelp() {

    return `    
    Developer environment tools.
    
    Usage: 
      
      mdctl dev env [command] [options]
          
    Arguments:               
      
      command                      
        export - export from an endpoint environment        
        import - import to an endpoint environment        
                
      options     
        --endpoint sets the endpoint. eg. api.dev.medable.com     
        --env sets the environment. eg. example                              
        --quiet - suppress confirmations
        --manifest - defaults to $cwd/manifest.json
        --sparse - sparse manifest?
        --format - export format (json, yaml) defaults to json                        
    `

  }

}

module.exports = Dev
