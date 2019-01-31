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
          throw new Error(err)
        }
        return result
      },

      loginWithExistingCredentials = cli => async(credentialsQuery) => {
        const passwordSecret = await CredentialsManager.get(credentialsQuery),
              client = await cli.getApiClient({ passwordSecret, testStatus: false }),
              loginBody = { email: _.get(passwordSecret, 'username'), password: _.get(passwordSecret, 'password') },
              result = await logInAndStoreLogIn(client)(loginBody)

        return result
      },

      logInWithPasswordSecret = cli => async(passwordSecret) => {
        const client = await cli.getApiClient({ passwordSecret, testStatus: false }),
              loginBody = { email: _.get(passwordSecret, 'username'), password: _.get(passwordSecret, 'password') },
              result = await logInAndStoreLogIn(client)(loginBody)

        return result
      }

module.exports = {
  // logInWithDefaultCreds,
  // logInWithUserCredentials,
  loginWithExistingCredentials,
  logInWithPasswordSecret
}
