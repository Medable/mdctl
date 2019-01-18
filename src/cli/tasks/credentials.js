/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      { URL } = require('url'),
      { prompt } = require('inquirer'),
      { rString, isSet } = require('../../lib/utils/values'),
      { CredentialsManager } = require('../../lib/api/credentials'),
      Environment = require('../../lib/api/environment'),
      Task = require('../lib/task')

class Credentials extends Task {

  async run(cli) {

    const arg1 = cli.args('1'),
          handler = `credentials@${arg1}`

    if (!isSet(arg1)) {
      return console.log(Credentials.help(cli))
    }

    if (!_.isFunction(this[handler])) {
      throw new Error('Invalid command')
    }
    return this[handler](cli)

  }

  async 'credentials@list'() {
    console.log('credentials@list')
  }

  async 'credentials@find'() {
    console.log('credentials@find')
  }

  async 'credentials@clear'() {
    console.log('credentials@clear')
  }

  async 'credentials@get'() {
    console.log('credentials@get')
  }

  async 'credentials@add'(cli) {

    const options = {
      type: rString(cli.args('type')),
      endpoint: rString(cli.args('endpoint')),
      env: rString(cli.args('env'))
    }

    // validate what's there.

    // only ask questions for what we need when quiet.

    //


    Object.assign(
      options,
      await prompt([
        {
          name: 'type',
          message: 'Which type of credentials are you storing?',
          type: 'list',
          default: 'basic',
          choices: [
            { name: 'Basic - Email/Username and Password', value: 'basic' },
            { name: 'Signing - API Key and Secret Pair', value: 'sign' },
            { name: 'Token - JWT Authentication Token', value: 'token' }
          ],
          when: () => !['basic', 'sign', 'token'].includes(options.type)
        },
        {
          name: 'endpoint',
          message: 'The api endpoint (example: https://api.dev.medable.com)',
          type: 'input',
          default: rString(cli.config('defaultEndpoint'), ''),
          when: () => {
            try {
              Credentials.validateEndpoint(options.endpoint)
              return false
            } catch (err) {
              return true
            }
          },
          validate: (input) => {
            try {
              return Credentials.validateEndpoint(input)
            } catch (err) {
              return err.getMessage()
            }
          },
          filter: (input) => {
            const { protocol, host } = new URL('', input)
            return `${protocol}//${host}`
          }
        },
        {
          name: 'env',
          message: 'The env (org code)',
          type: 'input',
          default: rString(cli.config('defaultEnv'), ''),
          when: () => !rString(options.env)
        },
        {
          name: 'username',
          message: 'The account email/username',
          type: 'input',
          when: hash => hash.type === 'basic'
        },
        {
          name: 'password',
          message: 'The account password',
          type: 'password',
          when: hash => hash.type === 'basic'
        },
        {
          name: 'token',
          message: 'The JSON Web Token',
          type: 'password',
          when: hash => hash.type === 'token'
        },
        {
          name: 'key',
          message: 'The api signing key',
          type: 'input',
          when: hash => hash.type === 'sign'
        },
        {
          name: 'secret',
          message: 'The api signing secret',
          type: 'password',
          when: hash => hash.type === 'sign'
        }
      ])
    )

    await CredentialsManager.add(
      new Environment(`${options.endpoint}/${options.env}`),
      options
    )

  }

  async 'credentials@set'() {
    console.log('credentials@set')
  }

  async 'credentials@delete'() {
    console.log('credentials@delete')
  }

  // ----------------------------------------------------------------------------------------------

  static get synopsis() {
    return 'manage stored accounts, jwt and signing secrets.'
  }

  static help(cli) {

    const command = cli.args('2') || cli.args('1')

    switch (command) {
      case 'list': return this.listHelp()
      default:
    }

    return `    
    Credentials management.
    
    Usage: 
            
      mdctl credentials list [type] --env --endpoint [--account]
      mdctl credentials find [--type] [--env] [--endpoint] [--key] [--account]
      mdctl credentials clear [--type] [--env] [--endpoint] [--key] [--account]
      mdctl credentials get --type --endpoint --env
      mdctl credentials add --type --endpoint --env
      mdctl credentials set --type --endpoint --env
      mdctl credentials delete --type --endpoint --env [--key] [--account]               
          
    Arguments:               
      
      command                                
        list - list stored credentials by type, environment and endpoint. uses defaults
        find - find stored credentials. leaving out options list all stored credentials
        get - retrieve credentials. if type not specified, then first found credentials are supplied 
        set - set/update credentials
        delete - clear all credentials.         
                
      options                       
        --input - read options from a json/yaml file                     
        --quiet - suppress confirmations
        --type - sets the credential type
        --endpoint sets the endpoint. eg. api.dev.medable.com     
        --env sets the environment. eg. my-org-code                            
    `
  }

  static listHelp() {

    return `    
    List credentials
    
    Usage: 
      
      mdctl credentials list
          
    Arguments:                          
                
      options     
        --endpoint sets the endpoint. eg. api.dev.medable.com     
        --env sets the environment. eg. example                              
        --quiet - suppress confirmations
        --manifest - defaults to $cwd/manifest.json
        --sparse - sparse manifest?
        --format - export format (json, yaml, text) defaults to text                        
    `

  }


  static validateEndpoint(endpoint) {

    const { protocol, host } = new URL('', endpoint)
    if (!(protocol && host)) {
      throw new TypeError('Invalid endpoint URL.')
    }
    return true

  }


}

module.exports = Credentials
