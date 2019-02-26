const { URL } = require('url'),
      { rString, isSet } = require('mdctl-core-utils/values'),
      {
        Secret, PasswordSecret, TokenSecret, SignatureSecret
      } = require('./secrets'),
      { normalizeEndpoint } = require('mdctl-core-utils'),
      Environment = require('./environment'),
      typeNames = ['password', 'signature', 'token']

let Undefined

function equalsStringOrRegex(test, input) {

  const str = rString(input, ''),
        match = str.match(/^\/(.*)\/(.*)/)

  if (match && match[0].length) {
    return new RegExp(match[1], match[2]).test(test)
  }
  return test === input

}

function detectAuthType(input) {

  const options = isSet(input) ? input : {},

    type = rString(options.type, 'auto')

  if (type === 'auto') {
    if (options.token) {
      return 'token'
    } if (options.apiSecret) {
      return 'signature'
    } if (options.password) {
      return 'password'
    }
  }
  return rString(options.type, null)

}


class CredentialsProvider {

  decode(inputService, inputAccount, inputSecret) {

    const service = rString(inputService, ''),
          account = rString(inputAccount, ''),
          secret = rString(inputSecret, ''),
          url = new URL('', account),
          [, env, version, apiKey, username] = url.pathname.split('/'),
          environment = new Environment(`${url.protocol}//${url.host}/${env}/${version}`)

    switch (service) {
      case 'password':
        return new PasswordSecret(environment, { username, apiKey, password: secret })
      case 'token':
        return new TokenSecret(environment, { token: secret })
      case 'signature':
        return new SignatureSecret(environment, { apiKey, apiSecret: secret })
      default:
        throw new TypeError('Unsupported credentials type. Expected password, token or signature.')
    }

  }

  create(environment, input) {

    const env = (environment instanceof Environment) ? environment : new Environment(environment),
          options = isSet(input) ? input : {},
          type = detectAuthType(options)

    switch (type) {
      case 'password':
        return new PasswordSecret(env, options)
      case 'token':
        return new TokenSecret(env, options)
      case 'signature':
        return new SignatureSecret(env, options)
      default:
        throw new TypeError('Unsupported credentials type. Expected password, token or signature.')
    }

  }

  /**
   * note: use includeEmail when generating tokens when it's safe to include the cortex/eml claim.
   * this allows you to look up a token by email address.
   *
   * @param environment
   * @param input
   *  type: 'auto'. auto-detected based on input properties
   *    password: username, password
   *    token: token
   *    signature: apiKey, apiSecret
   *
   * @returns {Promise<*|*|*>}
   */
  async add(environment, input) {

    const secret = this.create(environment, input)

    await this.setCredentials(secret.type, secret.encoded, secret.password)
    return secret
  }

  /**
   * @param input
   *  type - optional
   *  endpoint - optional
   *  env - optional
   *  username - optional
   *  apiKey - optional
   *
   * @returns {Promise<void>}
   */
  async list(input) {

    const options = isSet(input) ? input : {},
          type = rString(options.type) && detectAuthType({ type: options.type }),
          endpoint = normalizeEndpoint(options.endpoint),
          env = rString(options.env),
          username = rString(options.username),
          apiKey = rString(options.apiKey),
          list = await Promise.all(
            (type ? [type] : typeNames)
              .map(async typeName => (await this.getCredentials(typeName))
                .map((item) => {
                  try {
                    return this.decode(typeName, item && item.account, item && item.password)
                  } catch (err) {
                    return null
                  }
                })
                .filter(item => (item
              && (!endpoint || item.environment.endpoint === endpoint)
              && (!env || item.environment.env === env)
              && (!username || equalsStringOrRegex(item.username, username))
              && (!apiKey || item.apiKey === apiKey)
                )))
          )

    return list.reduce((memo, part) => [...memo, ...part], [])

  }

  async get(input) {
    if (input instanceof Secret) {
      return input
    }
    return (await this.list(input))[0]
  }

  async clear(input) {

    const list = await this.list(input)

    return (await Promise.all(
      list.map(async(item) => {
        const deleted = await this.deleteCredentials(item.type, item.encoded)
        return deleted ? 1 : 0
      })
    )).reduce((memo, count) => memo + count, 0)

  }

  async flush(typeName) {

    const list = await this.getCredentials(typeName)

    return (await Promise.all(
      list.map(async(item) => {
        const deleted = await this.deleteCredentials(typeName, item.account)
        return deleted ? 1 : 0
      })
    )).reduce((memo, count) => memo + count, 0)

  }


  async getCustom(name, context) {

    const list = await this.getCredentials(name),
          item = list
            .filter(({ account }) => account === context)
            .map(({ password }) => password)[0]

    try {
      return item && JSON.parse(Buffer.from(item, 'base64').toString('utf8'))
    } catch (err) {
      return null
    }

  }

  async setCustom(name, context, data = null) {

    if (data === null) {
      return this.deleteCredentials(name, context)
    }

    return this.setCredentials(
      name,
      context,
      Buffer.from(JSON.stringify(data), 'utf8').toString('base64')
    )

  }

  // ----------------------------------------------------

  // eslint-disable-next-line no-unused-vars
  async getCredentials(service) {
    return []
  }

  // eslint-disable-next-line no-unused-vars
  async setCredentials(service, account, password) {
    return Undefined
  }

  // eslint-disable-next-line no-unused-vars
  async deleteCredentials(service, account) {
    return false
  }

  async close() {
    return true
  }

}


module.exports = {
  CredentialsProvider,
  detectAuthType
}
