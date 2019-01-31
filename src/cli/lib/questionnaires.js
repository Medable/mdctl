const { prompt } = require('inquirer'),
      _ = require('lodash'),
      Table = require('cli-table'),
      {
        Credentials, validateApiKey, validateApiSecret
      } = require('../../lib/api/credentials'),
      {
        rString, rInt
      } = require('../../lib/utils/values'),

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
            validate: value => _.inRange(_.parseInt(value), -1, listOfSecrets.length) || `Must select between -1...${(listOfSecrets.length - 1)}`,
            transform: value => rInt(value, -1),
            default: -1,
          }
        ])

        return result.credentialsIndex
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
  question
}
