const _ = require('lodash'),
      os = require('os'),
      {
        CredentialsManager,
      } = require('../../lib/api/credentials'),
      { question } = require('./questionnaires'),

      storeCurrentLogin = async({ client, password }) => {
        let result
        try {
          result = await CredentialsManager.setCustom('login', '*', {
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

      logInAndStoreLogIn = client => async(loginBody) => {
        let result
        try {
          result = await client.post('/accounts/login', loginBody)
          await storeCurrentLogin({ client, password: loginBody.password })
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
          throw new Error(err)
        }
        return result
      },

      loginWithExistingCredentials = cli => async(credentialsQuery) => {
        const passwordSecret = await CredentialsManager.get(credentialsQuery),
              client = await cli.getApiClient({ passwordSecret, resurrect: false }),
              loginBody = { email: _.get(passwordSecret, 'username'), password: _.get(passwordSecret, 'password') }

        return logInAndStoreLogIn(client)(loginBody)
      },

      logInWithPasswordSecret = cli => async(passwordSecret) => {
        const client = await cli.getApiClient({ passwordSecret, resurrect: false }),
              loginBody = { email: _.get(passwordSecret, 'username'), password: _.get(passwordSecret, 'password') }

        return logInAndStoreLogIn(client)(loginBody)
      }

module.exports = {
  // logInWithDefaultCreds,
  // logInWithUserCredentials,
  loginWithExistingCredentials,
  logInWithPasswordSecret
}
