const { prompt } = require('inquirer'),
      _ = require('lodash'),
      jsonwebtoken = require('jsonwebtoken'),
      Table = require('cli-table'),
      {
        validateApiKey, validateApiSecret, guessEndpoint, validateEndpoint
      } = require('@medable/mdctl-core-utils'),
      Environment = require('@medable/mdctl-core/credentials/environment'),
      {
        rString, rInt, isSet
      } = require('@medable/mdctl-core-utils/values'),

      askUserCredentials = async(inputArgs) => {

        const currentArgs = Object.assign(
                _.clone(inputArgs),
                guessEndpoint(inputArgs)
              ),
              result = await prompt([
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
                  when: () => !['password', 'signature', 'token'].includes(_.get(currentArgs, 'type')) && !isSet(currentArgs.type)
                },
                {
                  name: 'endpoint',
                  message: 'The api endpoint (example: https://api.dev.medable.com)',
                  type: 'input',
                  when: hash => !isSet(currentArgs.endpoint) && (hash.type !== 'token'),
                  validate: value => validateEndpoint(value) || 'Invalid URL',
                  default: rString(_.get(currentArgs, 'endpoint'))
                },
                {
                  type: 'input',
                  name: 'env',
                  message: 'The env (org code)',
                  default: rString(_.get(currentArgs, 'env')),
                  when: hash => !isSet(currentArgs.env) && (hash.type !== 'token')
                },
                {
                  type: 'input',
                  name: 'username',
                  message: 'The account username',
                  default: rString(_.get(currentArgs, 'username')),
                  when: hash => !isSet(currentArgs.username) && (hash.type === 'password' || _.get(currentArgs, 'type') === 'password')
                },
                {
                  name: 'password',
                  message: 'The account password',
                  type: 'password',
                  default: rString(_.get(currentArgs, 'password')),
                  when: hash => !isSet(currentArgs.password) && (hash.type === 'password' || _.get(currentArgs, 'type') === 'password')
                },
                {
                  name: 'token',
                  message: 'The JSON Web Token',
                  type: 'password',
                  default: rString(_.get(currentArgs, 'token')),
                  when: hash => !isSet(currentArgs.token) && (hash.type === 'token' || _.get(currentArgs, 'type') === 'token'),
                  validate: (input, hash) => {
                    const jwt = jsonwebtoken.decode(input)
                    if (jwt) {
                      const environment = new Environment(jwt.aud)
                      hash.endpoint = environment.endpoint // eslint-disable-line no-param-reassign
                      hash.env = environment.env // eslint-disable-line no-param-reassign
                    }
                    return !!jwt
                  }
                },
                {
                  name: 'apiKey',
                  message: 'The api key',
                  type: 'input',
                  default: rString(_.get(currentArgs, 'apiKey')),
                  when: hash => (['password', 'signature'].includes(hash.type) || ['password', 'signature'].includes(_.get(currentArgs, 'type'))) && !isSet(currentArgs.apiKey),
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
                  when: hash => (hash.type === 'signature' || _.get(currentArgs, 'type') === 'signature') && !isSet(currentArgs.apiSecret),
                  validate: (input) => {
                    try {
                      return validateApiSecret(input)
                    } catch (err) {
                      return err.getMessage()
                    }
                  }
                }
              ])

        return _.extend(currentArgs, result)
      },

      askUserToSaveCredentials = async() => {
        const result = await prompt([
          {
            name: 'saveCredentials',
            message: 'Do you want to save these credentials?',
            validate: value => (value.toLowerCase() === 'y' || value.toLowerCase() === 'n') || 'Only valid values are: y-Y/n-N',
            default: 'n',
          }
        ])

        return _.startsWith(result.saveCredentials.toLowerCase(), 'y')
      },

      getDomainInfo = (inputArgs) => {
        const { environment, username, apiKey } = inputArgs,
              { host, env } = environment,
              tempDomain = host.substring(0, host.indexOf('.medable')),
              domain = (['api', 'api-eu1'].includes(tempDomain)) ? 'prod' : tempDomain.replace(/(api-|api.)/, '')

        let server
        if (host.indexOf('eu1') > 0) {
          server = 'Europe'
        } else if (host.endsWith('.com')) {
          server = 'US'
        } else {
          server = 'China'
        }

        return {
          server, domain, env, username, apiKey
        }
      },

      askUserToChooseCredentials = async(listOfSecrets) => {
        const credentialsInRowFormat = _(listOfSecrets).map(({
                environment, username, apiKey
              }) => getDomainInfo({ environment, username, apiKey })).map(({
                server, domain, env, username, apiKey
              }, idx) => [idx, server, domain.toUpperCase(), env, username, apiKey]).value(),
              // Get the longest Org code and set the minimum to 15
              maxEnvLength = (Math.max(...(credentialsInRowFormat
                .map(el => el[3]).map(e => e.length))) + 4) || 15,
              // Get the longest Email and set the minimum to 30
              maxUsernameLength = (Math.max(...(credentialsInRowFormat
                .map(el => el[4]).map(e => e.length))) + 4) || 30,
              // Set the credentials table that will be displayed
              table = new Table({
                head: ['Idx', 'Server', 'Env', 'Org', 'Email', 'ApiKey'],
                colWidths: [5, 10, 10, maxEnvLength, maxUsernameLength, 25]
              })

        table.push(...credentialsInRowFormat)

        console.log(table.toString())

        // eslint-disable-next-line one-var
        const result = await prompt([
          {
            name: 'credentialsIndex',
            message: 'Select the index of credential or -1 if none',
            validate: value => _.inRange(_.parseInt(value), -1, listOfSecrets.length) || `Must select between -1...${(listOfSecrets.length - 1)}`,
            transform: value => rInt(value, -1),
            default: -1,
          }
        ])

        return result.credentialsIndex
      },

      askWorkspaceLock = async(inputArgs) => {
        const currentArgs = Object.assign(
                _.clone(inputArgs),
                guessEndpoint(inputArgs)
              ),
              result = await prompt([{
                name: 'action',
                message: 'What do you want to do with locks?',
                type: 'list',
                choices: ['add', 'remove', 'list', 'clear'],
                when: () => !['add', 'remove', 'list', 'clear'].includes(_.get(currentArgs, 'action')) && !isSet(currentArgs.action)
              }, {
                name: 'endpoint',
                message: 'The api endpoint (example: dev or edge)',
                type: 'input',
                when: hash => !isSet(currentArgs.endpoint) && ['clear', 'list'].indexOf((hash.action || currentArgs.action)) < 0,
                validate: value => value !== '' || 'Invalid value for endpoint',
                default: rString(_.get(currentArgs, 'endpoint'))
              },
              {
                type: 'input',
                name: 'env',
                message: 'The env (org code, empty will match all)',
                default: rString(_.get(currentArgs, 'env')),
                when: hash => !isSet(currentArgs.env) && ['clear', 'list'].indexOf((hash.action || currentArgs.action)) < 0
              },
              {
                type: 'checkbox',
                name: 'actions',
                message: 'Use this lock for',
                choices: ['import', 'export'],
                default: rString(_.get(currentArgs, 'actions'), 'import,export').split(','),
                when: hash => !isSet(currentArgs.actions) && ['clear', 'list', 'remove'].indexOf((hash.action || currentArgs.action)) < 0
              }
              ])
        return _.extend(currentArgs, result)
      },

      question = async(message, defaultValue, options = {}) => {
        const result = await prompt(Object.assign({
          type: 'input',
          name: 'question',
          message,
          default: rString(defaultValue, undefined)
        }, options))
        return result && result.question
      }

module.exports = {
  askUserCredentials,
  askUserToSaveCredentials,
  askUserToChooseCredentials,
  askWorkspaceLock,
  question,
  getDomainInfo
}
