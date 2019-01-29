/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      os = require('os'),
      { URL } = require('url'),
      Table = require('cli-table'),
      jsyaml = require('js-yaml'),
      { prompt } = require('inquirer'),
      { loadDefaults, writeDefaults } = require('../lib/config'),
      { loadJsonOrYaml, question, normalizeEndpoint } = require('../../lib/utils'),
      {
        rVal, rString, isSet, stringToBoolean
      } = require('../../lib/utils/values'),
      {
        Credentials: ApiCredentials, CredentialsManager,
        detectAuthType, validateApiKey, validateApiSecret
      } = require('../../lib/api/credentials'),
      Client = require('../../lib/api/client'),
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

  someOtherFunction() {
    return true
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
          name: 'apiKey',
          message: 'The api key',
          type: 'input',
          when: hash => ['password', 'signature'].includes(hash.type) && !rString(options.apiKey),
          validate: (input) => {
            try {
              return validateApiKey(input)
            } catch (err) {
              return err.getMessage()
            }
          }
        },
        {
          name: 'apiSecret',
          message: 'The api signing secret',
          type: 'password',
          when: hash => hash.type === 'signature' && !rString(options.apiSecret),
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

    const options = {}

    // load from input file
    if (rString(cli.args('file'))) {
      const file = await loadJsonOrYaml(cli.args('file'))
      Object.assign(
        options,
        _.pick(
          file,
          'endpoint', 'env', 'username', 'apiKey', 'password'
        )
      )
    }

    // add anything from args
    Credentials.assignArgIf(cli, options, 'endpoint')
    Credentials.assignArgIf(cli, options, 'env')
    Credentials.assignArgIf(cli, options, 'username')
    Credentials.assignArgIf(cli, options, 'apiKey')

    // if no args were specified, attempt to use default credentials.
    if (Object.keys(options).length === 0) {
      Object.assign(
        options,
        _.pick(
          cli.config('defaultCredentials'),
          'endpoint', 'env', 'username', 'apiKey', 'password'
        )
      )
    }

    // set missing items using configured defaults.
    if (!isSet(options.endpoint)) {
      options.endpoint = cli.config('defaultEndpoint')
    }
    if (!isSet(options.env)) {
      options.env = cli.config('defaultEnv')
    }
    if (!isSet(options.username)) {
      options.username = cli.config('defaultAccount')
    }

    options.endpoint = normalizeEndpoint(options.endpoint)

    // eslint-disable-next-line one-var
    const secretsQuery = _.pickBy({
            type: 'password',
            endpoint: options.endpoint,
            env: options.env,
            username: options.username,
            apiKey: options.apiKey
          }, _.identity),
          secrets = await CredentialsManager.getAllMatchingCredentials(secretsQuery)
    console.log('SecretsQuery', secretsQuery)
    let secret = _.first(secrets),
        credentialsIndex

    if (secrets.length > 1) {
      const table = new Table({
        head: ['Index', 'Account', 'ApiKey'],
        colWidths: [33, 33, 33]
      })

      table.push(...secrets.map(({
        // eslint-disable-next-line no-shadow
        username, apiKey
      }, idx) => [idx, username, apiKey]))

      console.log(table.toString())

      // eslint-disable-next-line one-var
      credentialsIndex = await prompt([
        {
          name: 'credentialsIndex',
          message: 'Select the index of credential or -1 if none',
          transform: (value) => {
            let result = -1
            try {
              result = parseInt(value, 10)
            // eslint-disable-next-line no-empty
            } catch (err) {

            }
            return result
          },
          default: -1,
        }
      ])

      if (credentialsIndex.credentialsIndex === -1) {
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
              default: rString(cli.config('defaultEnv'), '')
            },
            {
              name: 'username',
              message: 'The account email/username',
              type: 'input',
              when: hash => hash.type === 'password'
            },
            {
              name: 'password',
              message: 'The account password',
              type: 'password',
              when: hash => hash.type === 'password'
            },
            {
              name: 'token',
              message: 'The JSON Web Token',
              type: 'password',
              when: hash => hash.type === 'token'
            },
            {
              name: 'apiKey',
              message: 'The api key',
              type: 'input',
              when: hash => ['password', 'signature'].includes(hash.type),
              validate: (input) => {
                try {
                  return validateApiKey(input)
                } catch (err) {
                  return err.getMessage()
                }
              }
            },
            {
              name: 'apiSecret',
              message: 'The api signing secret',
              type: 'password',
              when: hash => hash.type === 'signature',
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
      } else {
        secret = secrets[credentialsIndex.credentialsIndex]
      }
    } else if (secret) {
      if (!options.apiKey) {
        options.apiKey = secret.apiKey
      }
      options.password = secret.password
    }


    // ask the caller if anything is left.
    Object.assign(
      options,
      await prompt([
        {
          name: 'endpoint',
          message: 'The api endpoint',
          type: 'input',
          default: rString(options.endpoint, ''),
          transform: normalizeEndpoint,
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
          when: () => !rString(options.env)
        },
        {
          name: 'username',
          message: 'The account email',
          type: 'input',
          when: () => !rString(options.username)
        },
        {
          name: 'password',
          message: 'The account password',
          type: 'password',
          when: () => !rString(options.password)
        },
        {
          name: 'apiKey',
          message: 'The api key',
          type: 'input',
          when: () => !rString(options.apiKey),
          validate: (input) => {
            try {
              return validateApiKey(input)
            } catch (err) {
              return err.getMessage()
            }
          }
        }
      ])
    )

    {

      const client = new Client({
              environment: new Environment(options),
              credentials: new ApiCredentials(options),
              sessions: true,
              requestOptions: {
                strictSSL: stringToBoolean(rVal(cli.args('strictSSL'), cli.config('strictSSL')), true)
              }
            }),
            { environment, requestOptions } = client,
            { url, endpoint, env } = environment,
            { apiKey, username, password } = options,
            appURL = `${endpoint}/${env}`.replace('api.', 'app.'),


            loginBody = { email: options.username, password: options.password }

      try {

        console.log('LoginBody', JSON.stringify(loginBody))

        await client.post('/accounts/login', loginBody)

      } catch (err) {

        switch (err.code) {
          case 'kUnverifiedLocation':
          case 'kNewLocation':
          case 'kCallbackFormat':
          case 'kCallbackNotFound':
            loginBody.location = {
              verificationToken: await question('This location requires verification. Enter the token you received via SMS.'),
              locationName: `mdctl.medable.com@${os.hostname()}`,
              singleUse: false
            }
            await client.post('/accounts/login', loginBody)
            break

          case 'kPasswordExpired':
            console.log(`Your password expired. Please update it now at ${appURL}`)
            return
          default:
            console.log(err.toJSON())
            return
        }

      }

      // save the last login credentials. re-use these for all calls until logout.
      await CredentialsManager.setCustom('login', '*', {
        client: {
          environment: url,
          credentials: { apiKey, username },
          sessions: true,
          requestOptions
        },
        password
      })

      if (credentialsIndex.credentialsIndex === -1) {
        const saveCredentials = await prompt([
          {
            name: 'saveCredentials',
            message: 'Do you want to save these credentials?',
            default: true,
          }
        ])

        if (saveCredentials.saveCredentials) {
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
                name: 'apiKey',
                message: 'The api key',
                type: 'input',
                when: hash => ['password', 'signature'].includes(hash.type) && !rString(options.apiKey),
                validate: (input) => {
                  try {
                    return validateApiKey(input)
                  } catch (err) {
                    return err.getMessage()
                  }
                }
              },
              {
                name: 'apiSecret',
                message: 'The api signing secret',
                type: 'password',
                when: hash => hash.type === 'signature' && !rString(options.apiSecret),
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
        }
      }
    }

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
