/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      os = require('os'),
      { URL } = require('url'),
      Table = require('cli-table'),
      jsyaml = require('js-yaml'),
      { prompt } = require('inquirer'),
      { loadDefaults, writeDefaults } = require('../lib/config'),
      {
        loadJsonOrYaml, question, normalizeEndpoint, isFault
      } = require('../../lib/utils'),
      {
        rVal, rString, isSet, stringToBoolean, rInt
      } = require('../../lib/utils/values'),
      {
        Credentials: ApiCredentials, CredentialsManager, PasswordSecret,
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

    const allowedArguments = ['file', 'endpoint', 'env', 'username', 'apiKey', 'strictSSL'],
          parsedArguments = cli.getArguments(allowedArguments),
          readFile = async(filePath) => {
            const result = await loadJsonOrYaml(filePath)
            return _.pick(result, 'endpoint', 'env', 'username', 'apiKey', 'password')
          },
          options = _.has(parsedArguments, 'file') ? await readFile(parsedArguments.file) : _.extend(_.clone(parsedArguments), { type: 'password' }),

          // eslint-disable-next-line no-shadow
          storeCurrentLogin = CredentialsManager => async({ client, password }) => {
            let result
            try {
              result = await CredentialsManager.setCustom('login', '*', {
                client,
                password
              })
            } catch (err) {
              result = _.extend(_.clone(result), { object: 'fault' })
            }
            return result
          },

          logInAndStoreLogIn = client => async(loginBody) => {
            let result
            try {
              result = await client.post('/accounts/login', loginBody)
              storeCurrentLogin(client, loginBody.password)
            } catch (err) {
              if (err.code === 'kCallbackNotFound') {
                const location = {
                        verificationToken: await question('This location requires verification. Enter the token you received via SMS'),
                        locationName: `mdctl.medable.com@${os.hostname()}`,
                        singleUse: false
                      },
                      loginBodyWithLocation = _.extend(_.clone(loginBody), { location })
                return logInAndStoreLogIn(client)(loginBodyWithLocation)
              }
              result = err
            }
            return result
          },

          // eslint-disable-next-line no-shadow
          logInWithDefaultCreds = cli => async(defaultCredentials) => {
            const passwordSecret = await CredentialsManager.get(defaultCredentials),
                  client = await cli.getApiClient({ passwordSecret, testStatus: false }),
                  result = await logInAndStoreLogIn(client)(passwordSecret)

            return result
          },

          // eslint-disable-next-line no-shadow
          logInWithUserCredentials = cli => async(userCredentials) => {
            const passwordSecret = new PasswordSecret(
                    new Environment(userCredentials),
                    userCredentials
                  ),
                  client = await cli.getApiClient({ passwordSecret, testStatus: false }),
                  result = await logInAndStoreLogIn(client)(passwordSecret)

            return result
          },

          // eslint-disable-next-line no-shadow
          logInWithPasswordSecret = cli => async(passwordSecret) => {
            const client = await cli.getApiClient({ passwordSecret, testStatus: false }),
                  result = await logInAndStoreLogIn(client)(passwordSecret)

            return result
          },

          // eslint-disable-next-line no-shadow
          storeCredentials = CredentialsManager => async(credentials) => {
            let result
            try {
              result = await CredentialsManager.add(
                new Environment(credentials),
                credentials
              )
            } catch (err) {
              result = _.extend(_.clone(result), { object: 'fault' })
            }
            return result
          },

          askUserCredentials = async(currentArgs) => {
            const result = await prompt([
              {
                name: 'type',
                message: 'Which type of credentials are you using?',
                type: 'list',
                default: _.get(currentArgs, 'type'),
                choices: [
                  { name: 'Password - Email/Username and Password', value: 'password' },
                  { name: 'Signature - API Key and Secret Pair', value: 'signature' },
                  { name: 'Token - JWT Authentication Token', value: 'token' }
                ],
                when: () => !['password', 'signature', 'token'].includes(_.get(currentArgs, 'type')) && _.isUndefined(currentArgs.type)
              },
              {
                name: 'endpoint',
                message: 'The api endpoint (example: https://api.dev.medable.com)',
                type: 'input',
                when: () => {
                  try {
                    Credentials.validateEndpoint(_.get(currentArgs, 'endpoint'))
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
                },
                default: rString(_.get(currentArgs, 'endpoint'))
              },
              {
                type: 'input',
                name: 'env',
                message: 'The env (org code)',
                default: rString(_.get(currentArgs, 'env')),
                when: _.isUndefined(currentArgs.env)
              },
              {
                type: 'input',
                name: 'username',
                message: 'The account username',
                default: rString(_.get(currentArgs, 'username')),
                when: hash => _.isUndefined(currentArgs.username) && (hash.type === 'password' || _.get(currentArgs, 'type') === 'password')
              },
              {
                name: 'password',
                message: 'The account password',
                type: 'password',
                default: rString(_.get(currentArgs, 'password')),
                when: hash => _.isUndefined(currentArgs.password) && (hash.type === 'password' || _.get(currentArgs, 'type') === 'password')
              },
              {
                name: 'token',
                message: 'The JSON Web Token',
                type: 'password',
                default: rString(_.get(currentArgs, 'token')),
                when: hash => _.isUndefined(currentArgs.token) && (hash.type === 'token' || _.get(currentArgs, 'type') === 'token')
              },
              {
                name: 'apiKey',
                message: 'The api key',
                type: 'input',
                default: rString(_.get(currentArgs, 'apiKey')),
                when: hash => (['password', 'signature'].includes(hash.type) || ['password', 'signature'].includes(_.get(currentArgs, 'type'))) && _.isUndefined(currentArgs.apiKey),
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
                default: rString(_.get(currentArgs, 'apiSecret')),
                when: hash => (hash.type === 'signature' || _.get(currentArgs, 'type') === 'signature') && _.isUndefined(currentArgs.apiSecret),
                validate: (input) => {
                  try {
                    return validateApiSecret(input)
                  } catch (err) {
                    return err.getMessage()
                  }
                }
              }
            ])

            return _.extend(_.clone(currentArgs), result)
          },

          askUserToSaveCredentials = async() => {
            const result = await prompt([
              {
                name: 'saveCredentials',
                message: 'Do you want to save these credentials?',
                validate: value => (value.toLowerCase() === 'y' || value.toLowerCase() === 'n') || 'Only valid values are: y-Y/n-N',
                transform: value => _.startsWith(value.toLowerCase(), 'y'),
                default: 'n',
              }
            ])

            return result.saveCredentials
          },

          askUserToChooseCredentials = async(listOfSecrets) => {
            const table = new Table({
                    head: ['Idx', 'URL', 'Email', 'ApiKey'],
                    colWidths: [5, 50, 20, 25]
                  }),
                  credentialsInRowFormat = _(listOfSecrets)
                  // This is a hack but the object comes in a way that prop can't be read
                    .map(s => JSON.parse(JSON.stringify(s)))
                    .map(({ url, email, apiKey }, idx) => [idx, url, email, apiKey]).value()

            table.push(...credentialsInRowFormat)

            console.log(table.toString())

            // eslint-disable-next-line one-var
            const result = await prompt([
              {
                name: 'credentialsIndex',
                message: 'Select the index of credential or -1 if none',
                validate: value => _.inRange(rInt(value, -1), -1, (listOfSecrets.length - 1)) || `Must select between -1...${(listOfSecrets.length - 1)}`,
                transform: value => rInt(value, -1),
                default: -1,
              }
            ])

            return result.credentialsIndex
          }

    if (_.isEmpty(parsedArguments)) {
      const defaultCredentials = cli.config('defaultCredentials')

      if (defaultCredentials && defaultCredentials.type === 'password') {
        const result = await logInWithDefaultCreds(cli)(defaultCredentials)
        if (isFault(result)) throw new Error(result)
      } else {
        const userCredentials = await askUserCredentials(options),
              result = await logInWithUserCredentials(cli)(userCredentials)
        if (isFault(result)) throw new Error(result)
        // eslint-disable-next-line one-var
        const existingCredentials = await CredentialsManager.list(userCredentials)
        if (_.isEmpty(existingCredentials)) {
          const saveCredentials = await askUserToSaveCredentials()
          if (saveCredentials) storeCredentials(userCredentials)
        }
      }
    } else {
      const existingPasswordSecrets = await CredentialsManager.list(options)
      if (existingPasswordSecrets.length === 0) {
        const userCredentials = await askUserCredentials(options),
              result = await logInWithUserCredentials(cli)(userCredentials)
        if (isFault(result)) throw new Error(result)
        // eslint-disable-next-line one-var
        const saveCredentials = await askUserToSaveCredentials()
        if (saveCredentials) storeCredentials(userCredentials)
      } else if (existingPasswordSecrets.length === 1) {
        const result = await logInWithPasswordSecret(cli)(_(existingPasswordSecrets).first())
        if (isFault(result)) throw new Error(result)
      } else {
        // more than 1
        const existingPasswordIdx = await askUserToChooseCredentials(existingPasswordSecrets)
        if (existingPasswordIdx > -1) {
          const loginFunc = logInWithPasswordSecret(cli),
                result = await loginFunc(existingPasswordSecrets[existingPasswordIdx])
          if (isFault(result)) throw new Error(result)
        } else {
          const userCredentials = await askUserCredentials(options),
                result = await logInWithUserCredentials(cli)(userCredentials)
          if (isFault(result)) throw new Error(result)
          // eslint-disable-next-line no-shadow
          // eslint-disable-next-line one-var
          const existingCredentials = await CredentialsManager.list(userCredentials)
          if (_.isEmpty(existingCredentials)) {
            const saveCredentials = await askUserToSaveCredentials()
            if (saveCredentials) storeCredentials(userCredentials)
          }
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
