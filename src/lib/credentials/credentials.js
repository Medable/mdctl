/* eslint-disable class-methods-use-this */

const jsonwebtoken = require('jsonwebtoken'),
      { URL } = require('url'),
      { privatesAccessor } = require('../privates'),
      { Config, CredentialsConfig } = require('../config'),
      {
        rString, isSet, rPath
      } = require('../utils/values'),
      { normalizeEndpoint, pathTo } = require('../utils'),
      { signPath } = require('../api/signer'),
      Environment = require('../api/environment'),
      typeNames = ['password', 'signature', 'token']

// ------------------------------------------------------------------------------------------------
// secrets are stored for a balanced lookup.
//  - the known elements are in the service (service + . + type)
//  - the username is made up of protocol/host/endpoint/env/version/key/username
//    where username is anything after the version (protocol//host/env/version/username)
//  - passwords and secrets are stored in the password field as is.


class Secret {

  /**
   *
   * @param typeName
   * @param environment
   * @param username
   * @param apiKey the app api key.
   * @param password
   */
  constructor(typeName, environment, username, apiKey, password) {

    Object.assign(privatesAccessor(this), {
      typeName, environment, username, apiKey, password
    })
  }

  get type() {
    return privatesAccessor(this).typeName
  }

  get environment() {
    return privatesAccessor(this).environment
  }

  get username() {
    return privatesAccessor(this).username
  }

  get apiKey() {
    return privatesAccessor(this).apiKey
  }

  get password() {
    return privatesAccessor(this).password
  }

  get encoded() {
    const { environment, username, apiKey } = privatesAccessor(this)
    return `${environment.url}/${apiKey}/${username}`
  }

  toJSON() {
    const { typeName, environment, apiKey } = privatesAccessor(this)
    return {
      type: typeName,
      url: environment.url,
      apiKey
    }
  }

  /**
   * @param input
   *  apiKey optional. force a different api key
   */
  getAuthorizationHeaders(input) {

    const options = isSet(input) ? input : {},
          privates = privatesAccessor(this)

    return {
      'medable-client-key': rString(options.apiKey, privates.apiKey)
    }

  }

}

class PasswordSecret extends Secret {

  constructor(environment, input) {

    const options = isSet(input) ? input : {}

    if (!rString(options.username)) {
      throw new TypeError('Invalid password credentials. expected a username.')
    }
    super('password', environment, options.username, options.apiKey, rString(options.password, ''))
  }

  toJSON() {
    return Object.assign(super.toJSON(), {
      email: this.username,
      password: this.password
    })
  }

  /**
   * @param input
   *  basic: boolean. default false. if true, adds Basic auth authorization header.
   */
  getAuthorizationHeaders(input) {

    const headers = super.getAuthorizationHeaders(input)

    if (pathTo(input, 'basic') === true) {
      headers.authorization = `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`
    }

    return headers
  }


}

class TokenSecret extends Secret {

  constructor(environment, input) {

    const options = isSet(input) ? input : {},
          jwt = rString(options.token) && jsonwebtoken.decode(options.token)

    if (!jwt) {
      throw new TypeError('Invalid jwt token credentials.')
    }
    if (!jwt['cortex/eml']) {
      throw new TypeError('Token secrets used here must include the cortex/eml claim for username lookup.')
    }
    validateApiKey(jwt.iss)

    super('token', environment, jwt['cortex/eml'], jwt.iss, options.token)
  }

  toJSON() {
    return Object.assign(super.toJSON(), {
      token: this.password
    })
  }

  get token() {
    return this.password
  }

  /**
   * @param input
   */
  getAuthorizationHeaders(input) {

    const headers = super.getAuthorizationHeaders(input)

    headers.authorization = `Bearer ${this.password}`

    return headers

  }

}

class SignatureSecret extends Secret {

  constructor(environment, input) {

    const options = isSet(input) ? input : {}

    if (!rString(options.apiKey) || !rString(options.apiSecret)) {
      throw new TypeError('Invalid signing credentials. expected a key and secret.')
    }
    validateApiKey(options.apiKey)
    validateApiSecret(options.apiSecret)

    super('signature', environment, '', options.apiKey, options.apiSecret)
  }

  toJSON() {
    return Object.assign(super.toJSON(), {
      apiSecret: this.password
    })
  }

  get apiSecret() {
    return this.password
  }

  /**
   * @param input
   *  path    (default '/')
   *  method  (default 'GET')
   *  principal optional.
   */
  getAuthorizationHeaders(input) {

    const options = isSet(input) ? input : {},
          headers = super.getAuthorizationHeaders(options),
          { signature, nonce, timestamp } = signPath(
            rString(options.path, '/'),
            this.apiKey,
            this.password,
            rString(options.method, 'GET')
          )

    Object.assign(headers, {
      'medable-client-signature': signature,
      'medable-client-nonce': nonce,
      'medable-client-timestamp': timestamp
    })

    if (options.principal) {
      headers['medable-client-account'] = options.principal
    }

    return headers

  }

}

// ------------------------------------------------------------------------------------------------

class CredentialsManager {

  /**
   * @param config
   *  provider: credentials provider
   *  prefix: the prefix given to keys. defaults to 'com.medable.mdctl'
   */
  constructor(config) {

    Object.assign(privatesAccessor(this), {
      config: {
        credentials: new CredentialsConfig({ provider: rPath(config, 'provider', Config.global.credentials.provider) }),
      },
      prefix: rString(rPath(config, 'provider'), 'com.medable.mdctl')
    })
  }

  get provider() {
    return privatesAccessor(this).config.credentials.provider
  }

  set provider(provider) {
    privatesAccessor(this).config.credentials.provider = provider
  }

  get prefix() {
    return privatesAccessor(this).prefix
  }

  decode(inputService, inputAccount, inputSecret) {

    const service = rString(inputService, ''),
          account = rString(inputAccount, ''),
          secret = rString(inputSecret, ''),
          type = service.startsWith(this.prefix) && service.substr(this.prefix.length + 1),
          url = new URL('', account),
          [, env, version, apiKey, username] = url.pathname.split('/'),
          environment = new Environment(`${url.protocol}//${url.host}/${env}/${version}`)

    switch (type) {
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
   *
   * @returns {Promise<void>}
   */
  async add(environment, input) {

    const secret = this.create(environment, input)

    await this.provider.setCredentials(`${this.prefix}.${secret.type}`, secret.encoded, secret.password)
    return true
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
            (type ? [type] : typeNames).map(async(typeName) => {

              const service = `${this.prefix}.${typeName}`
              return (await this.provider.getCredentials(service))
                .map((item) => {
                  try {
                    return this.decode(service, item && item.account, item && item.password)
                  } catch (err) {
                    return null
                  }
                })
                .filter(item => (item
                  && (!endpoint || item.environment.endpoint === endpoint)
                  && (!env || item.environment.env === env)
                  && (!username || equalsStringOrRegex(item.username, username))
                  && (!apiKey || item.apiKey === apiKey)
                ))

            })
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
        const deleted = await this.provider.deleteCredentials(`${this.prefix}.${item.type}`, item.encoded)
        return deleted ? 1 : 0
      })
    )).reduce((memo, count) => memo + count, 0)

  }

  async flush(typeName) {

    const service = `${this.prefix}.${typeName}`,
          list = await this.provider.getCredentials(service)

    return (await Promise.all(
      list.map(async(item) => {
        const deleted = await this.provider.deleteCredentials(`${this.prefix}.${typeName}`, item.account)
        return deleted ? 1 : 0
      })
    )).reduce((memo, count) => memo + count, 0)

  }


  async getCustom(name, context) {

    const list = await this.provider.getCredentials(`${this.prefix}.${name}`),
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

    const service = `${this.prefix}.${name}`

    if (data === null) {
      return this.provider.deleteCredentials(service, context)
    }

    return this.provider.setCredentials(
      service,
      context,
      Buffer.from(JSON.stringify(data), 'utf8').toString('base64')
    )

  }

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

function validateApiKey(apiKey) {
  if (/^([0-9a-z-A-Z]){22}$/i.test(rString(apiKey))) {
    return true
  }
  throw new TypeError('Invalid api key')
}

function validateApiSecret(secret) {
  if (/^([0-9a-z-A-Z]){64}$/i.test(rString(secret))) {
    return true
  }
  throw new TypeError('Invalid api secret')
}

function equalsStringOrRegex(test, input) {

  const str = rString(input, ''),
        match = str.match(/^\/(.*)\/(.*)/)

  if (match && match[0].length) {
    return new RegExp(match[1], match[2]).test(test)
  }
  return test === input

}


// ------------------------------------------------------------------------------------------------

module.exports = {
  CredentialsManager,
  detectAuthType,
  validateApiKey,
  validateApiSecret
}
