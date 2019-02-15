/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      Table = require('cli-table'),
      jsyaml = require('js-yaml'),
      { loadDefaults, writeDefaults } = require('../lib/config'),
      {
        loadJsonOrYaml, pathsTo
      } = require('../../lib/utils'),
      {
        rString, isSet
      } = require('../../lib/utils/values'),
      {
        CredentialsManager,
        detectAuthType
      } = require('../../lib/api/credentials'),
      Environment = require('../../lib/api/environment'),
      Task = require('../lib/task'),
      Fault = require('../../lib/fault'),
      {
        askUserCredentials,
      } = require('../lib/questionnaires'),
      { logInFlow } = require('../lib/log-in-flows')

class Credentials extends Task {

  static get taskNames() {

    return ['credentials', 'creds']

  }

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

    const options = (await cli.getAuthOptions()) || {}

    // load from input file?
    if (rString(cli.args('file'))) {
      // support adding a bunch at once.
      const file = await loadJsonOrYaml(cli.args('file'))
      if (Array.isArray(file)) {
        return Promise.all(file.map(input => CredentialsManager.add(input, input)))
      }
    }
    // auto-detect type
    options.type = detectAuthType(options)

    Object.assign(
      options,
      await askUserCredentials(options)
    )

    await CredentialsManager.add(
      new Environment(`${options.endpoint}/${options.env}`),
      options
    )

    return true

  }

  async 'credentials@list'(cli) {

    const options = await cli.getAuthOptions(),
          format = rString(cli.args('format'), 'text')

    let list = await CredentialsManager.list(options)

    list = list.map(({
      environment, type, username, apiKey
    }) => {
      const { endpoint, env, version } = environment
      return {
        endpoint, env, version, type, username, apiKey
      }
    })

    list = _.sortBy(list, ['endpoint', 'env', 'version', 'type', 'username', 'apiKey'])

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
            endpoint, env, version, type, username, apiKey
          }) => [endpoint, env, version, type, username, apiKey]))

          console.log(table.toString())
        }
        break

      default:
        throw new RangeError('Invalid output format. Expected json, pretty, yaml or text')
    }

  }

  async 'credentials@get'(cli) {

    const options = await cli.getAuthOptions(),
          item = await CredentialsManager.get(options)

    if (item) {
      console.log(formatOutput(item, cli.args('format')))
    }

  }

  async 'credentials@default'(cli) {

    const verb = cli.args('2')

    let defaultCredentials

    if (verb === 'set') {

      const options = await cli.getAuthOptions(),
            secret = await CredentialsManager.get(options)

      if (!secret) {
        throw new RangeError('Credentials not found.')
      } else {

        const {
                environment, type, username, apiKey
              } = secret,
              { endpoint, env, version } = environment

        defaultCredentials = {
          type, endpoint, env, version, username, apiKey
        }

        await writeDefaults({ defaultCredentials })
      }

    } else if (verb === 'clear') {

      await writeDefaults({ defaultCredentials: null })

    } else {

      const { defaultCredentials: defaults } = await loadDefaults()
      defaultCredentials = defaults
    }

    if (defaultCredentials) {
      console.log(formatOutput(defaultCredentials, cli.args('format')))
    }

  }

  async 'credentials@clear'(cli) {

    console.log(
      await CredentialsManager.clear(
        await cli.getAuthOptions()
      )
    )

  }

  async 'credentials@login'(cli) {

    await this['credentials@logout'](cli)

    console.log(await logInFlow(cli) ? 'Log-in succeeded' : 'Log-in failed')
  }

  async 'credentials@logout'(cli) {

    // attempt to logout of the api.
    try {

      const client = await cli.getApiClient({ resurrect: false })
      await client.post('/accounts/me/logout')

    } catch (err) {
      // eslint-disable-line no-empty
    }

    // erase any previously stored active login
    await CredentialsManager.setCustom('login', '*')

  }

  async 'credentials@whoami'(cli) {

    try {

      const client = await cli.getApiClient({ credentials: await cli.getAuthOptions() }),
            { environment, credentials } = client,
            { type, apiKey, username: email } = credentials,
            { fault, loggedin, account } = await client.get('/accounts/status?expand=true'),
            result = {
              type,
              url: environment.url,
              apiKey,
              loggedin
            }

      if (email) {
        result.account = {
          email
        }
      }

      if (fault) {

        console.log(formatOutput(Fault.from(fault, true).toJSON(), cli.args('format')))

      } else {

        if (!account) {
          result.account = {
            _id: '000000000000000000000001'
          }
        } else if (_.isString(account)) {
          result.account = {
            _id: account
          }
        } else {
          result.account = pathsTo(account, '_id', 'email', 'name.first', 'name.last', 'roles')
        }

        console.log(formatOutput(result, cli.args('format')))
      }

    } catch (err) {

      console.log(formatOutput(err.toJSON(), cli.args('format')))
    }

  }

  async 'credentials@flush'() {

    const deleted = (await CredentialsManager.clear())
      + (await CredentialsManager.flush('fingerprint'))
      + (await CredentialsManager.flush('session'))
      + (await CredentialsManager.flush('login'))

    console.log(deleted)

  }


  // ----------------------------------------------------------------------------------------------

  static get synopsis() {
    return 'manage stored accounts, jwt and signing secrets.'
  }

  static help() {

    return `    
    Credentials management.
    
    Usage: 
      
      mdctl credentials [command] --type --endpoint --env --username --apiKey --file --format                   
          
    Arguments:               
      
      Command 
                                     
        list - list stored credentials by type, environment, endpoint, username and/or apiKey.       
        add - add or update credentials.       
        get - output the first matching stored credentials.
        default [get|set|clear] - set or show the default credentials, if any.        
        clear - clear all matching credentials.
        login - start a password session.    
        logout - end a login session        
        whoami - get the current authorization state
        flush - clear everything (credentials, fingerprints, logins, session data, etc) from the keychain
                
      Options 
                            
        --file - read options from a json/yaml file.                     
        --type - sets the type (password, token, signature). auto-detected when adding/updating.
        --endpoint - sets the endpoint. eg. https://api.dev.medable.com     
        --env sets the environment. eg. my-org-code
        --username for password and token auth, sets the lookup username / email / subject id
        --apiKey api key for looking up signing credentials (and token credentials)
        --format - output format. defaults to json (json, yaml, text)             
        --strictSSL - for login. default true. set to false to allow invalid certs for local testing.                       
        
      Input file options (secrets cannot be read from the command-line):        
            
        password - account password for login.
        apiSecret - api secret key for signing.
        token - jwt token, which must include the 'cortex/eml' claim for lookup. 
        
        other options readable from file: type, endpoint, env, username, apiKey
        
    Notes: 
      
      Stored JWT tokens must include the 'cortex/eml' claim (created with the includeEmail option).
      Tokens with the claim store the email address as the username, which the credentials manager
      uses to look up accounts.       
      
      There can only be a single active session for the user at any one time on the client.                                   
                                     
    `
  }

}

function formatOutput(data, format = 'json') {

  switch (format) {
    case 'json':
      return JSON.stringify(data)
    case 'pretty':
      return JSON.stringify(data, null, 2)
    case 'yaml':
      return jsyaml.safeDump(data)
    default:
      throw new RangeError('Invalid output format. Expected json, pretty or yaml')
  }

}


module.exports = Credentials
