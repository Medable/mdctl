/* eslint-disable class-methods-use-this */

const fs = require('fs'),
      path = require('path'),
      _ = require('lodash'),
      Task = require('../lib/task')

class Dev extends Task {

  async run(cli) {

    const arg2 = cli.args('2'),
          handler = `${cli.args('1')}@${arg2}`

    if (arg2 === null) {
      return console.log(Dev.help(cli))
    }

    if (!_.isFunction(this[handler])) {
      throw new Error('Invalid command')
    }
    return this[handler](cli)
  }

  async 'auth@clear'() {

    console.log('mdctl dev auth clear')
  }

  async 'auth@login'() {

    console.log('mdctl dev auth login')
  }

  async 'auth@status'() {

    console.log('mdctl dev auth status')
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
      case 'auth': return this.authHelp()
      case 'env': return this.envHelp()
      default:
    }

    return `    
    Developer tools.
    
    Usage: 
      
      mdctl dev [command] [options]
          
    Arguments:               
      
      command        
        auth - authenticate into environment
        env - environment tools         
                
      options                           
        --quiet - suppress confirmations                        
    `
  }

  static authHelp() {

    return `    
    Developer tools authentication.
    
    Usage: 
      
      mdctl dev auth [command] [options]
          
    Arguments:               
      
      command                
        clear - clear authentication tokens and saved passwords.
        status - check the current login or token status.
        login - login to the current environment.
                
      options     
        --env - sets the environment [${fs.readdirSync(path.join(__dirname, '../../environments/')).filter(f => path.extname(f) === '.yaml').map(f => path.basename(f, '.yaml'))}].              
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
        --env - sets the environment [${fs.readdirSync(path.join(__dirname, '../../environments/')).filter(f => path.extname(f) === '.yaml').map(f => path.basename(f, '.yaml'))}].              
        --quiet - suppress confirmations
        --manifest - defaults to $cwd/manifest.json
        --sparse - sparse manifest?
        --format - export format (json, yaml) defaults to json                        
    `

  }

}

module.exports = Dev
