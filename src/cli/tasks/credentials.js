/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      { URL } = require('url'),
      Table = require('cli-table'),
      jsyaml = require('js-yaml'),
      { prompt } = require('inquirer'),
      { loadJsonOrYaml } = require('../../lib/utils'),
      { rString, isSet } = require('../../lib/utils/values'),
      {
        CredentialsManager, detectAuthType, validateApiKey, validateApiSecret
      } = require('../../lib/api/credentials'),
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

  async 'credentials@add'(cli) {

    const options = {}

    // load from input file?
    if (rString(cli.args('file'))) {

      // support adding a bunch at once.
      const file = await loadJsonOrYaml(cli.args('file'))
      if (Array.isArray(file)) {
        return Promise.all(file.map(input => CredentialsManager.add(input, input)))
      }

      Object.assign(
        options,
        _.pick(
          file,
          'type', 'endpoint', 'env', 'username', 'key', 'password', 'secret', 'token'
        )
      )
    }

    Credentials.assignArgIf(cli, options, 'type')
    Credentials.assignArgIf(cli, options, 'endpoint')
    Credentials.assignArgIf(cli, options, 'env')

    // auto-detect type
    options.type = detectAuthType(options)

    Object.assign(
      options,
      await prompt([
        {
          name: 'type',
          message: 'Which type of credentials are you storing?',
          type: 'list',
          default: 'password',
          choices: [
            { name: 'Password - Email/Username and Password', value: 'password' },
            { name: 'Signature - API Key and Secret Pair', value: 'signature' },
            { name: 'Token - JWT Authentication Token', value: 'token' }
          ],
          when: () => !['password', 'signature', 'token'].includes(options.type)
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
          when: hash => hash.type === 'password' && !rString(options.username)
        },
        {
          name: 'password',
          message: 'The account password',
          type: 'password',
          when: hash => hash.type === 'password' && !rString(options.password)
        },
        {
          name: 'token',
          message: 'The JSON Web Token',
          type: 'password',
          when: hash => hash.type === 'token' && !rString(options.token)
        },
        {
          name: 'key',
          message: 'The api key',
          type: 'input',
          when: hash => ['password', 'signature'].includes(hash.type) && !rString(options.key),
          validate: (input) => {
            try {
              return validateApiKey(input)
            } catch (err) {
              return err.getMessage()
            }
          }
        },
        {
          name: 'secret',
          message: 'The api signing secret',
          type: 'password',
          when: hash => hash.type === 'signature' && !rString(options.secret),
          validate: (input) => {
            try {
              return validateApiSecret(input)
            } catch (err) {
              return err.getMessage()
            }
          }
        }
      ])
    )

    await CredentialsManager.add(
      new Environment(`${options.endpoint}/${options.env}`),
      options
    )

    return true

  }

  async 'credentials@list'(cli) {

    const options = await Credentials.getCliOptions(cli),
          format = rString(cli.args('format'), 'text')

    let list = await CredentialsManager.list(options)

    list = list.map(({
      environment, type, username, key
    }) => {
      const { endpoint, env, version } = environment
      return {
        endpoint, env, version, type, username, key
      }
    })

    list = _.sortBy(list, ['endpoint', 'env', 'version', 'type', 'username', 'key'])

    switch (format) {
      case 'json':
        console.log(JSON.stringify(list))
        break
      case 'pretty':
        console.log(JSON.stringify(list, null, 2))
        break
      case 'yaml':
        console.log(jsyaml.safeDump(list))
        break
      case 'text':
        {
          const table = new Table({
            head: ['Endpoint', 'Env (Org Code)', 'Version', 'Type', 'Account', 'ApiKey'],
            colWidths: [32, 30, 9, 11, 32, 24]
          })

          table.push(...list.map(({
            endpoint, env, version, type, username, key
          }) => [endpoint, env, version, type, username, key]))

          console.log(table.toString())
        }
        break

      default:
        throw new RangeError('Invalid output format. Expected json, pretty, yaml or text')
    }

  }

  async 'credentials@get'(cli) {

    const options = await Credentials.getCliOptions(cli),
          format = rString(cli.args('format'), 'json')

    {
      const item = await CredentialsManager.get(options)

      if (item) {
        switch (format) {
          case 'json':
            console.log(JSON.stringify(item))
            break
          case 'pretty':
            console.log(JSON.stringify(item, null, 2))
            break
          case 'yaml':
            console.log(jsyaml.safeDump(item))
            break
          default:
            throw new RangeError('Invalid output format. Expected json, pretty or yaml')
        }
      }
    }

  }

  async 'credentials@clear'(cli) {

    console.log(
      await CredentialsManager.clear(
        await Credentials.getCliOptions(cli)
      )
    )

  }

  // ----------------------------------------------------------------------------------------------

  static get synopsis() {
    return 'manage stored accounts, jwt and signing secrets.'
  }

  static help() {

    return `    
    Credentials management.
    
    Usage: 
      
      mdctl credentials [command] --type --endpoint --env --username --key --file --format                   
          
    Arguments:               
      
      Command 
                                     
        list - list stored credentials by type, environment, endpoint, username and/or key       
        add - add or update credentials.
        get - retrieve first matching credentials.               
        clear - clear all matching credentials.
                
      Options 
                            
        --file - read options from a json/yaml file.                     
        --type - sets the type (password, token, signature). auto-detected when adding/updating.
        --endpoint - sets the endpoint. eg. https://api.dev.medable.com     
        --env sets the environment. eg. my-org-code
        --username for password and token auth, sets the lookup username / email / subject id
        --key api key for looking up signing credentials (and token credentials)
        --format - output format. defaults to text (json, yaml, text)                
        
      Input file options (secrets cannot be read from the command-line):        
            
        password - account password for login.
        secret - api secret key for signing.
        token - jwt token, which must include the 'cortex/eml' claim for lookup. 
        
        other options readable from file: type, endpoint, env, username, key
        
    Notes: 
      
      Stored JWT tokens must include the 'cortex/eml' claim (created with the includeEmail option).
      Tokens with the claim store the email address as the username, which the credentials manager
      uses to look up accounts.       
                                     
    `
  }

  static validateEndpoint(endpoint) {

    const { protocol, host } = new URL('', endpoint)
    if (!(protocol && host)) {
      throw new TypeError('Invalid endpoint URL.')
    }
    return true

  }

  static assignArgIf(cli, options, arg) {

    const value = cli.args(arg)
    if (rString(value)) {
      Object.assign(options, { [arg]: value })
    }
  }

  static async getCliOptions(cli) {

    const options = {}

    if (rString(cli.args('file'))) {
      const file = await loadJsonOrYaml(cli.args('file'))
      Object.assign(options, _.pick(file, 'type', 'endpoint', 'env', 'username', 'key'))
    }

    Credentials.assignArgIf(cli, options, 'type')
    Credentials.assignArgIf(cli, options, 'endpoint')
    Credentials.assignArgIf(cli, options, 'env')
    Credentials.assignArgIf(cli, options, 'username')
    Credentials.assignArgIf(cli, options, 'key')

    return options

  }

}


module.exports = Credentials
