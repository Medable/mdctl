/* eslint-disable class-methods-use-this */

const jsonwebtoken = require('jsonwebtoken'),
      { URL } = require('url'),
      keytar = require('keytar'),
      { privatesAccessor } = require('../privates'),
      { rString, isSet } = require('../utils/values'),
      pathTo = require('../utils/path.to'),
      { normalizeEndpoint } = require('../utils'),
      { signPath } = require('./signer'),
      Environment = require('./environment'),
      serviceName = 'com.medable.mdctl',
      typeNames = ['password', 'signature', 'token']

let Undefined

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

  get service() {
    const { typeName } = privatesAccessor(this)
    return `${serviceName}.${typeName}`
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
          privates = privatesAccessor(this),
          headers = {
            'medable-client-key': rString(options.apiKey, privates.apiKey)
          }

    return headers

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

class CredentialsProvider {

  static get() {
    return privatesAccessor(this).provider
  }

  static set(provider) {

    if (!(provider instanceof CredentialsProvider)) {
      throw new TypeError('storage provider must extend CredentialsProvider')
    }
    privatesAccessor(this).provider = provider
  }

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

}

// ------------------------------------------------------------------------------------------------

class CredentialsManager {


  static decode(inputService, inputAccount, inputSecret) {

    const service = rString(inputService, ''),
          account = rString(inputAccount, ''),
          secret = rString(inputSecret, ''),
          type = service.startsWith(serviceName) && service.substr(serviceName.length + 1),
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

  static create(environment, input) {

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
  static async add(environment, input) {

    const secret = this.create(environment, input)
    await CredentialsProvider.get().setCredentials(secret.service, secret.encoded, secret.password)
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
  static async list(input) {

    const options = isSet(input) ? input : {},
          type = rString(options.type) && detectAuthType({ type: options.type }),
          endpoint = normalizeEndpoint(options.endpoint),
          env = rString(options.env),
          username = rString(options.username),
          apiKey = rString(options.apiKey),

          list = await Promise.all(
            (type ? [type] : typeNames).map(async(typeName) => {

              const service = `${serviceName}.${typeName}`
              return (await CredentialsProvider.get().getCredentials(service))
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

  static async get(input) {
    if (input instanceof Secret) {
      return input
    }
    return (await this.list(input))[0]
  }

  static async clear(input) {

    const list = await this.list(input)

    return (await Promise.all(
      list.map(async(item) => {
        const deleted = await CredentialsProvider.get().deleteCredentials(`${serviceName}.${item.type}`, item.encoded)
        return deleted ? 1 : 0
      })
    )).reduce((memo, count) => memo + count, 0)

  }

  static async flush(typeName) {

    const service = `${serviceName}.${typeName}`,
          list = await CredentialsProvider.get().getCredentials(service)

    return (await Promise.all(
      list.map(async(item) => {
        const deleted = await CredentialsProvider.get().deleteCredentials(`${serviceName}.${typeName}`, item.account)
        return deleted ? 1 : 0
      })
    )).reduce((memo, count) => memo + count, 0)

  }


  static async getCustom(name, context) {

    const list = await CredentialsProvider.get().getCredentials(`${serviceName}.${name}`),
          item = list
            .filter(({ account }) => account === context)
            .map(({ password }) => password)[0]

    try {
      return item && JSON.parse(Buffer.from(item, 'base64').toString('utf8'))
    } catch (err) {
      return null
    }

  }

  static async setCustom(name, context, data = null) {

    const service = `${serviceName}.${name}`

    if (data === null) {
      return CredentialsProvider.get().deleteCredentials(service, context)
    }

    return CredentialsProvider.get().setCredentials(
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

class KeytarStorageProvider extends CredentialsProvider {

  async getCredentials(service) {
    return keytar.findCredentials(service)
  }

  async setCredentials(service, account, password) {
    return keytar.setPassword(service, account, password)
  }

  async deleteCredentials(service, account) {
    return keytar.deletePassword(service, account)
  }

}

CredentialsProvider.set(new KeytarStorageProvider())

// ------------------------------------------------------------------------------------------------

module.exports = {
  CredentialsManager,
  detectAuthType,
  CredentialsProvider,
  validateApiKey,
  validateApiSecret,
  normalizeEndpoint
}
