const _ = require('lodash'),
      os = require('os'),
      { question } = require('./questionnaires'),

      storeCurrentLogin = async(cli, { client, password }) => {
        let result
        try {
          result = await cli.credentialsProvider.setCustom('login', '*', {
            client: {
              environment: client.environment.url,
              credentials: {
                apiKey: client.credentials.apiKey,
                username: client.credentials.username
              },
              sessions: true,
              requestOptions: client.requestOptions
            },
            password
          })
        } catch (err) {
          result = _.extend(_.clone(result), { object: 'fault' })
        }
        return result
      },

      logInAndStoreLogIn = (cli, client) => async(loginBody) => {
        let result
        try {
          result = await client.post('/accounts/login', loginBody)
          await storeCurrentLogin(cli, { client, password: loginBody.password })
        } catch (err) {
          if (err.code === 'kCallbackNotFound') {
            const location = {
                    verificationToken: await question('This location requires verification. Enter the token you received via SMS'),
                    locationName: `mdctl.medable.com@${os.hostname()}`,
                    singleUse: false
                  },
                  loginBodyWithLocation = _.extend(_.clone(loginBody), { location })
            return logInAndStoreLogIn(cli, client)(loginBodyWithLocation)
          }
          throw new Error(err)
        }
        return result
      },

      loginWithExistingCredentials = cli => async(credentialsQuery) => {
        const credentials = await cli.credentialsProvider.get(credentialsQuery),
              client = await cli.getApiClient({ credentials, resurrect: false }),
              loginBody = { email: _.get(credentials, 'username'), password: _.get(credentials, 'password') }

        return logInAndStoreLogIn(cli, client)(loginBody)
      },

      logInWithPasswordSecret = cli => async(credentials) => {
        const client = await cli.getApiClient({ credentials, resurrect: false }),
              loginBody = { email: _.get(credentials, 'username'), password: _.get(credentials, 'password') }

        return logInAndStoreLogIn(cli, client)(loginBody)
      }

module.exports = {
  loginWithExistingCredentials,
  logInWithPasswordSecret
}
