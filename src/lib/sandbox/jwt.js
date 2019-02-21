const _ = require('lodash'),
      {
        rInstance, isSet, rPath
      } = require('../utils/values'),
      sandbox = require('./sandbox'),
      Client = require('../api/client')

module.exports = {

  async list(input) {

    return sandbox.run({
      client: rPath(input, 'client'),
      script() {
        /* eslint-disable */
        /* global org script */
        const req = require('request'),
          apiKey = req.getHeader('medable-client-key'),
          { accounts } = org.objects

        script.exit(accounts.getSubjectTokens(apiKey, script.principal._id))
        /* eslint-enable */
      }
    })
  },

  async clear(input) {

    return sandbox.run({
      client: rPath(input, 'client'),
      script() {
        /* eslint-disable */
        /* global org, script */
        const req = require('request'),
          apiKey = req.getHeader('medable-client-key'),
          { accounts } = org.objects

        script.exit(accounts.revokeSubjectTokens(apiKey, script.principal._id))
        /* eslint-enable */
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
        /* eslint-disable */
        /* global org, script */
        const { accounts } = org.objects,
          { token } = script.arguments

        script.exit(accounts.revokeAuthToken(token))
        /* eslint-enable */
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
              /* eslint-disable */
          /* global org, script */
          const req = require('request'),
            apiKey = req.getHeader('medable-client-key'),
            { accounts } = org.objects

          script.exit(
            accounts.createAuthToken(
              apiKey,
              script.principal._id,
              {
                permanent: true,
                scope: ['*'],
                includeEmail: true
              }
            )
          )
          /* eslint-enable */
            }
          })

    return _.omit((await provider.add(environment, { token })).toJSON(), 'token')

  }

}
