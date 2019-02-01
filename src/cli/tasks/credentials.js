/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      Table = require('cli-table'),
      jsyaml = require('js-yaml'),
      { loadDefaults, writeDefaults } = require('../lib/config'),
      {
        loadJsonOrYaml,
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
      {
        askUserCredentials,
      } = require('../lib/questionnaires'),
      { logInFlow } = require('../lib/log-in-flows')

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
          'type', 'endpoint', 'env', 'username', 'apiKey', 'password', 'apiSecret', 'token'
        )
      )
    }

    Credentials.assignArgIf(cli, options, 'type')
    Credentials.assignArgIf(cli, options, 'endpoint')
    Credentials.assignArgIf(cli, options, 'env')
    Credentials.assignArgIf(cli, options, 'apiKey')

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

    const options = await Credentials.getCliOptions(cli),
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

    const options = await Credentials.getCliOptions(cli),
          item = await CredentialsManager.get(options)

    if (item) {
      console.log(formatOutput(item, cli.args('format')))
    }

  }

  async 'credentials@default'(cli) {

    const verb = cli.args('2')

    let defaultCredentials

    if (verb === 'set') {

      const options = await Credentials.getCliOptions(cli),
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
        await Credentials.getCliOptions(cli)
      )
    )

  }

  async 'credentials@login'(cli) {

    console.log(await logInFlow(cli) ? 'Log-in succeeded' : 'Log-in failed')
  }

  async 'credentials@logout'(cli) {

    // attempt to logout of the api.
    try {

      const client = cli.getApiClient({ ensureSession: false })
      await client.post('/accounts/logout')

    } catch (err) {
      // eslint-disable-line no-empty
    }

    // erase any previously stored active login
    await CredentialsManager.setCustom('login', '*')

  }

  async 'credentials@whoami'(cli) {

    try {

      const client = await cli.getApiClient(),
            { environment, credentials } = client,
            { authType: type, apiKey, username: email } = credentials,
            result = {
              type,
              url: environment.url,
              apiKey
            }

      if (email) {
        result.account = {
          email
        }
      }

      try {

        result.account = await client.get('/accounts/me', { query: { paths: ['_id', 'email', 'name.first', 'name.last', 'roles'] } })

      } catch (err) {
        // eslint-disable-line no-empty
      }

      console.log(formatOutput(result, cli.args('format')))

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
        --format - output format. defaults to text (json, yaml, text)             
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
      Object.assign(options, _.pick(file, 'type', 'endpoint', 'env', 'username', 'apiKey'))
    }

    Credentials.assignArgIf(cli, options, 'type')
    Credentials.assignArgIf(cli, options, 'endpoint')
    Credentials.assignArgIf(cli, options, 'env')
    Credentials.assignArgIf(cli, options, 'username')
    Credentials.assignArgIf(cli, options, 'apiKey')

    return options

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
