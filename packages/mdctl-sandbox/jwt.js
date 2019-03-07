const _ = require('lodash'),
      {
        rInstance, isSet, rPath
      } = require('@medable/mdctl-core-utils/values'),
      sandbox = require('./sandbox'),
      Client = require('@medable/mdctl-api/client')

module.exports = {

  async list(input) {

    return sandbox.run({
      client: rPath(input, 'client'),
      script() {

        /* global org script */
        const req = require('request'), // eslint-disable-line global-require
              apiKey = req.getHeader('medable-client-key'),
              { accounts } = org.objects

        script.exit(
          accounts.getSubjectTokens(
            apiKey,
            script.principal._id // eslint-disable-line no-underscore-dangle
          )
        )

      }
    })
  },

  async clear(input) {

    return sandbox.run({
      client: rPath(input, 'client'),
      script() {
        /* global org, script */
        const req = require('request'), // eslint-disable-line global-require
              apiKey = req.getHeader('medable-client-key'),
              { accounts } = org.objects

        script.exit(
          accounts.revokeSubjectTokens(
            apiKey,
            script.principal._id // eslint-disable-line no-underscore-dangle
          )
        )
      }
    })

  },

  /**
   * revoke a single permanent token
   *
   * @param input
   *  client
   *  token. token or jti
   *
   * @returns {Promise<*>}
   */
  async revoke(input) {

    const options = isSet(input) ? input : {},
          { client, token } = options

    return sandbox.run({
      client,
      arguments: { token },
      script() {
        /* global org, script */
        const { accounts } = org.objects,
              { token } = script.arguments // eslint-disable-line no-shadow

        script.exit(accounts.revokeAuthToken(token))
      }
    })

  },


  /**
   * create a permanent * scope token and store it in the credentials provider
   *
   * @param input
   *  client
   *
   * @returns {Promise<void>} the token details without the secret.
   */
  async create(input) {

    const options = isSet(input) ? input : {},
          client = rInstance(options.client, Client)
            ? options.client
            : new Client(options.client),
          { environment, provider } = client,
          token = await sandbox.run({
            client,
            script() {

              /* global org, script */
              const req = require('request'), // eslint-disable-line global-require
                    apiKey = req.getHeader('medable-client-key'),
                    { accounts } = org.objects

              script.exit(
                accounts.createAuthToken(
                  apiKey,
                  script.principal._id, // eslint-disable-line no-underscore-dangle
                  {
                    permanent: true,
                    scope: ['*'],
                    includeEmail: true
                  }
                )
              )

            }
          })

    return _.omit((await provider.add(environment, { token })).toJSON(), 'token')

  }

}
