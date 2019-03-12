/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      async = require('async'),
      os = require('os'),
      path = require('path'),
      rimraf = require('rimraf'),
      Table = require('cli-table'),
      jsyaml = require('js-yaml'),
      jsonwebtoken = require('jsonwebtoken'),
      { loadDefaults, writeDefaults } = require('../lib/config'),
      {
        loadJsonOrYaml, pathsTo
      } = require('@medable/mdctl-core-utils'),
      {
        rString, isSet
      } = require('@medable/mdctl-core-utils/values'),
      {
        detectAuthType
      } = require('@medable/mdctl-core/credentials/provider'),
      { Environment } = require('@medable/mdctl-api'),
      Task = require('../lib/task'),
      { Fault } = require('@medable/mdctl-core'),
      {
        askUserCredentials,
        question
      } = require('../lib/questionnaires'),
      { Client } = require('@medable/mdctl-api'),
      KeytarCredentialsProvider = require('@medable/mdctl-credentials-provider-keychain'),
      { jwt } = require('@medable/mdctl-sandbox'),
      { logInFlow } = require('../lib/log-in-flows')

class Credentials extends Task {

  constructor() {
    super({
      format: {
        type: 'string',
        default: 'text'
      }
    })
  }

  static get taskNames() {

    return ['credentials', 'creds']

  }

  async run(cli) {

    const arg1 = this.args('1'),
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
    if (rString(this.args('file'))) {
      // support adding a bunch at once.
      const file = await loadJsonOrYaml(this.args('file'))
      if (Array.isArray(file)) {
        return Promise.all(file.map(input => cli.credentialsProvider.add(input, input)))
      }
    }
    // auto-detect type
    options.type = detectAuthType(options)

    Object.assign(
      options,
      await askUserCredentials(options)
    )

    await cli.credentialsProvider.add(
      new Environment(`${options.endpoint}/${options.env}`),
      options
    )

    return true

  }

  async 'credentials@list'(cli) {

    const options = await cli.getAuthOptions(),
          format = rString(this.args('format'), 'text')

    let list = await cli.credentialsProvider.list(options)

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
          item = await cli.credentialsProvider.get(options)

    if (item) {
      console.log(formatOutput(item, this.args('format')))
    }

  }

  async 'credentials@default'(cli) {

    const verb = this.args('2')

    let defaultCredentials

    if (verb === 'set') {

      defaultCredentials = await setDefaultCredentials(cli, await cli.getAuthOptions())

    } else if (verb === 'clear') {

      await writeDefaults({ defaultCredentials: null })

    } else {

      const { defaultCredentials: defaults } = await loadDefaults()
      defaultCredentials = defaults
    }

    if (defaultCredentials) {
      console.log(formatOutput(defaultCredentials, this.args('format')))
    }

  }

  async 'credentials@clear'(cli) {

    const options = await cli.getAuthOptions()
    console.log(options
      ? await cli.credentialsProvider.clear(options)
      : 0)

    await writeDefaults({ defaultCredentials: null })

  }

  async 'credentials@login'(cli) {

    await this['credentials@logout'](cli)

    console.log(await logInFlow(cli) ? 'Log-in succeeded' : 'Log-in failed')
  }

  async 'credentials@auth'(cli) {

    const authOptions = await cli.getAuthOptions() || {},
          originalUsername = authOptions.username

    let tokenOptions = { ...authOptions, type: 'token' },
        tokenSecret = await cli.credentialsProvider.get(tokenOptions),
        tokenClient

    if (tokenSecret) {
      try {
        tokenClient = await cli.getApiClient({ credentials: tokenOptions })
      } catch (err) {
        // eslint-disable-line no-empty
      }
    }

    if (!tokenClient) {

      const loginOptions = { ...authOptions, type: 'password', username: originalUsername },
            loginBody = {}

      let loginSecret = await cli.credentialsProvider.get(loginOptions),
          client

      if (!loginSecret) {
        Object.assign(
          loginOptions,
          await askUserCredentials(loginOptions)
        )
        const {
          endpoint, env, type, username, password, apiKey
        } = loginOptions
        loginSecret = await cli.credentialsProvider.create({ endpoint, env }, {
          type, username, password, apiKey
        })
      }

      client = new Client({
        environment: loginSecret.environment,
        credentials: loginSecret,
        sessions: true
      })

      Object.assign(
        loginBody,
        { email: loginSecret.username, password: loginSecret.password }
      )

      try {
        await client.post('/accounts/login', loginBody)
      } catch (err) {
        switch (err.code) {
          case 'kUnverifiedLocation':
          case 'kNewLocation':
          case 'kCallbackFormat':
          case 'kCallbackNotFound':
            loginBody.location = {
              verificationToken: await question('This location requires verification. Enter your SMS verification token.'),
              locationName: `${cli.credentialsProvider.keyPrefix}@${os.hostname()}`,
              singleUse: false
            }
            await client.post('/accounts/login', loginBody)
            break
          default:
            throw err
        }
      }

      try {
        await client.post('/accounts/logout')
      } catch (err) {
        // eslint-disable-line no-empty
      }

      tokenOptions = await jwt.create({ client })
      tokenSecret = await cli.credentialsProvider.get(tokenOptions)
      tokenClient = await cli.getApiClient({ credentials: tokenSecret })
      client = null
    }

    console.log(
      await setDefaultCredentials(cli, await tokenClient.credentials.toJSON())
    )

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
    await cli.credentialsProvider.setCustom('login', '*')

  }

  async 'credentials@revoke'(cli) {

    const client = await cli.getApiClient({ credentials: await cli.getAuthOptions() }),
          { credentials } = client,
          { type } = credentials,
          jti = type === 'token' && jsonwebtoken.decode(credentials.token).jti

    if (!jti) {
      throw Fault.create('kInvalidArgument', { reason: 'Current credentials are not token-based.' })
    }

    console.log(formatOutput({
      local: await cli.credentialsProvider.deleteCredentials('token', credentials.encoded),
      remote: await jwt.revoke({ client, token: jti })
    }, this.args('format')))

    if (await matchesDefaults(credentials)) {
      await writeDefaults({ defaultCredentials: null })
    }

  }

  async 'credentials@jwt'(cli) {

    const command = this.args('2'),
          client = await cli.getApiClient({ credentials: await cli.getAuthOptions() }),
          { environment, credentials } = client,
          { endpoint, env } = environment,
          { username, apiKey } = credentials,
          { defaultCredentials } = await loadDefaults()

    console.log(formatOutput(await (async() => {

      switch (command) {

        case 'list':

          return (await jwt.list({ client })).data

        case 'revoke': {

          if (!this.args('3')) {
            throw Fault.create('kInvalidArgument', { reason: 'jti argument is mising.' })
          }

          const jti = this.args('3'),
                secrets = await cli.credentialsProvider.list({ type: 'token' }),
                secret = secrets.filter(v => jsonwebtoken.decode(v.token).jti === jti)[0],
                local = Boolean(
                  secret
                  && await cli.credentialsProvider.deleteCredentials(secret.type, secret.encoded)
                ),
                remote = await jwt.revoke({ client, token: jti })

          if (await matchesDefaults(secret, defaultCredentials)) {
            await writeDefaults({ defaultCredentials: null })
          }

          return {
            local,
            remote
          }
        }

        case 'clear': {

          const secrets = (await cli.credentialsProvider.list({
                  type: 'token', endpoint, env, username, apiKey
                })),
                jtis = new Set((await jwt.list({ client })).data.map(v => v.jti))

          let local = 0,
              remote = 0

          await new Promise((resolve, reject) => {
            async.eachSeries(
              secrets,
              async(secret) => {

                const { jti } = jsonwebtoken.decode(secret.token)

                if (await cli.credentialsProvider.deleteCredentials(secret.type, secret.encoded)) {
                  local += 1
                }
                try {
                  if (await jwt.revoke({ client, token: jti })) {
                    remote += 1
                  }
                } catch (e) {
                  // eslint-disable-line no-empty
                }

                jtis.delete(jti)

                if (await matchesDefaults(secret, defaultCredentials)) {
                  await writeDefaults({ defaultCredentials: null })
                }

              },
              err => (err ? reject(err) : resolve())
            )
          })

          await new Promise((resolve, reject) => {
            async.eachSeries(
              jtis,
              async(jti) => {
                if (await jwt.revoke({ client, token: jti })) {
                  remote += 1
                }
              },
              err => (err ? reject(err) : resolve())
            )
          })

          return {
            local,
            remote
          }

        }

        case 'create': {

          return jwt.create({ client })
        }

        default: {

          throw Fault.create('kInvalidArgument', { reason: `Unknown jwt command "${command}".` })
        }

      }

    })(), this.args('format')))

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
      if (credentials.type === 'token') {
        result.jwt = jsonwebtoken.decode(credentials.token)
      }

      if (fault) {

        console.log(formatOutput(Fault.from(fault, true).toJSON(), this.args('format')))

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

        console.log(formatOutput(result, this.args('format')))
      }

    } catch (err) {

      console.log(formatOutput(err.toJSON(), this.args('format')))
    }

  }

  async 'credentials@flush'(cli) {

    let deleted = 0

    const keyProvider = new KeytarCredentialsProvider('com.medable.mdctl')

    try {

      deleted += (await cli.credentialsProvider.clear())
        + (await cli.credentialsProvider.flush('fingerprint'))
        + (await cli.credentialsProvider.flush('session'))
        + (await cli.credentialsProvider.flush('login'))

    } catch (err) {
      // eslint-disable-line no-empty
    }

    await keyProvider.flush('pouchKey')

    try {
      rimraf.sync(path.join(os.homedir(), '.medable/mdctl.db*'))
    } catch (err) {
      // eslint-disable-line no-empty
    }

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
      
      mdctl credentials [command] [...args] --type --endpoint --env --username --apiKey --file --format                   
          
    Arguments:               
      
      Command 
                                     
        auth - creates a token in the target environment if one does not exist and sets it as the default.
               use this to quickly switch between environments. will not interfere with login sessions. if there
               are multiple matches available, the first match is selected.                                      
        list - list stored credentials by type, environment, endpoint, username and/or apiKey.       
        add - add or update credentials.       
        get - output the first matching stored credentials.
        default [get|set|clear] - set or show the default credentials, if any.        
        clear - clear all matching credentials. clearing credentials does not revoke tokens.        
        login - start a password session.    
        logout - end a login session        
        whoami - get the current authorization state
        revoke - revokes the current token credentials and removes it from local storage.
        flush - clear everything (credentials, fingerprints, logins, session data, etc)
        jwt - low-level token commands (these must be called using 'password' credentials, ie. a login)
          list - lists all user tokens in the current environment for the current apiKey (issuer)                   
          revoke - takes an additional jti argument. revokes the token in the current environment removes it from local storage.
          clear - revokes all subject tokens in the current environment (endpoint, env, apiKey, username) and removes them from local storage.
          create - creates a new token for the current environment and saves it into local storage          
                
      Options 
                            
        --file - read options from a json/yaml file.                     
        --type - sets the type (password, token, signature). auto-detected when adding/updating.
        --endpoint - sets the endpoint. eg. https://api.dev.medable.com     
        --env sets the environment. eg. my-org-code
        --username for password and token auth, sets the lookup username / email / subject id
        --apiKey api key for looking up signing credentials (and token credentials)
        --format - output format. defaults to json (json, yaml, text)
        --quiet - suppress confirmations for supported commands              
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

async function matchesDefaults(credentials, defaultCredentials) {
  let defaults = defaultCredentials
  if (!defaults) {
    defaults = (await loadDefaults()).defaultCredentials
  }
  if (defaults) {
    const {
            type, environment, username, apiKey
          } = (credentials),
          { endpoint, env } = environment

    return defaults.type === type
      && defaults.endpoint === endpoint
      && defaults.env === env
      && defaults.username === username
      && defaults.apiKey === apiKey
  }
  return false
}

async function setDefaultCredentials(cli, options) {

  const secret = await cli.credentialsProvider.get(options),
        {
          environment, type, username, apiKey
        } = secret || {},
        { endpoint, env, version } = environment || {},
        defaultCredentials = {
          type, endpoint, env, version, username, apiKey
        }

  if (!secret) {
    throw new RangeError('Credentials not found.')
  }

  await writeDefaults({ defaultCredentials })

  return defaultCredentials
}

module.exports = Credentials
