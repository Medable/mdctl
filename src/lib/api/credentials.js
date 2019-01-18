/* eslint-disable class-methods-use-this */

const jsonwebtoken = require('jsonwebtoken'),
      keytar = require('keytar'),
      { privatesAccessor } = require('../privates'),
      { rString, isSet } = require('../utils/values'),
      { signPath } = require('./signer'),
      Environment = require('./environment'),
      serviceName = 'com.medable.mdctl'

class Credentials {

  /**
   * @param input
   *  token,     // jwt token
   *  apiKey,    // required if no token is passed
   *  apiSecret, // for signed requests
   *  apiPrincipal, // for signed requests, sets the default principal
   *  username,  // for basic auth only
   *  password   // for basic auth only
   */
  constructor(input) {

    const options = isSet(input) ? input : {},
          jwt = rString(options.token) && jsonwebtoken.decode(options.token)

    Object.assign(privatesAccessor(this), {
      jwt,
      token: jwt && options.token,
      apiKey: jwt ? jwt.iss : rString(options.apiKey),
      apiSecret: rString(options.apiSecret),
      apiPrincipal: rString(options.apiPrincipal),
      username: rString(options.username, ''),
      password: rString(options.password, '')
    })

  }

  get apiKey() {
    return privatesAccessor(this).apiKey
  }

  get authType() {
    const privates = privatesAccessor(this)
    if (privates.jwt) {
      return 'token'
    }
    if (privates.secret) {
      return 'sign'
    }
    if (privates.username) {
      return 'basic'
    }
    return 'none'
  }

  /**
   * @param input
   *  type    detected based on options force to: ['auto', token', 'sign', 'basic', 'none']
   *  path    required for signed requests (default '/')
   *  method  required for signed requests (default 'GET')
   *  principal optional. for signed requests. defaults to apiPrincipal
   */
  getAuthorizationHeaders(input) {

    const options = isSet(input) ? input : {},
          privates = privatesAccessor(this),
          headers = {
            'medable-client-key': privates.apiKey
          }

    let type = rString(options.type, 'auto')
    if (type === 'auto') {
      if (privates.jwt) {
        type = 'token'
      } else if (privates.apiSecret) {
        type = 'sign'
      } else if (privates.username) {
        type = 'basic'
      } else {
        type = 'none'
      }
    }

    switch (type) {

      case 'token':

        headers.authorization = `Bearer ${privates.token}`
        break

      case 'sign':

        {
          const { signature, nonce, timestamp } = signPath(
                  rString(options.path, '/'),
                  privates.apiKey,
                  privates.apiSecret,
                  rString(options.method, 'GET')
                ),
                principal = rString(options.principal, rString(privates.apiPrincipal))

          Object.assign(headers, {
            'medable-client-signature': signature,
            'medable-client-nonce': nonce,
            'medable-client-timestamp': timestamp
          })

          if (principal) {
            headers['medable-client-account'] = principal
          }
        }
        break

      case 'basic':

        headers.authorization = `Basic ${Buffer.from(`${privates.username}:${privates.password}`).toString('base64')}`
        break

      default:

    }

    return headers

  }

}

// -----------------------------------------------------------------------------------------------0

class Secret {

  constructor(typeName, environment, username, password) {

    Object.assign(privatesAccessor(this), {
      typeName, environment, username, password
    })
  }

  get service() {
    const { typeName, environment } = privatesAccessor(this)
    return `${serviceName}.${typeName}@${environment.url}`
  }

  get username() {
    return privatesAccessor(this).username
  }

  get password() {
    return privatesAccessor(this).password
  }

}

class BasicSecret extends Secret {

  constructor(environment, input) {

    const options = isSet(input) ? input : {}

    if (!rString(options.username)) {
      throw new TypeError('Invalid basic credentials. expected a username.')
    }
    super('basic', environment, options.username, rString(options.password, ''))
  }

  get credentials() {

    const { username, password } = privatesAccessor(this)
    return new Credentials({ username, password })
  }

}

class TokenSecret extends Secret {

  constructor(environment, input) {

    const options = isSet(input) ? input : {},
          jwt = rString(options.token) && jsonwebtoken.decode(options.token)

    if (!jwt) {
      throw new TypeError('Invalid jwt token credentials.')
    }
    super('token', environment, jwt['cortex/eml'] || jwt.sub, options.token)
  }

  get credentials() {

    const { password } = privatesAccessor(this)
    return new Credentials({ token: password })
  }

}

class SignSecret extends Secret {

  constructor(environment, input) {

    const options = isSet(input) ? input : {}

    if (!rString(options.key) || !rString(options.secret)) {
      throw new TypeError('Invalid signing credentials. expected a key and secret.')
    }
    super('sign', environment, options.key, options.secret)
  }

  get credentials() {

    const { username, password } = privatesAccessor(this)
    return new Credentials({ apiKey: username, apiSecret: password })
  }

}

// -----------------------------------------------------------------------------------------------0

class CredentialsManager {


  static async list() {
    throw new RangeError('not implemented')
  }

  static async find() {
    throw new RangeError('not implemented')
  }

  static async clear() {
    throw new RangeError('not implemented')
  }

  static async get() {
    throw new RangeError('not implemented')
  }

  static async delete() {
    throw new RangeError('not implemented')
  }


  /**
   * note: use includeEmail when generating tokens when it's safe to include the cortex/eml claim.
   * this allows you to look up a token by email address.
   *
   * @param environment
   * @param input
   *  type: 'auto'. auto-detected based on input properties
   *    basic: username, password
   *    token: token
   *    sign: key, secret
   *
   *
   * @returns {Promise<void>}
   */
  static async add(environment, input) {

    const env = (environment instanceof Environment) ? environment : new Environment(environment),
          options = isSet(input) ? input : {}

    let secret,
        type = rString(options.type, 'auto')

    if (type === 'auto') {
      if (options.token) {
        type = 'token'
      } else if (options.secret) {
        type = 'sign'
      } else if (options.username) {
        type = 'basic'
      } else {
        type = null
      }
    }

    switch (type) {
      case 'basic':
        secret = new BasicSecret(env, options)
        break
      case 'token':
        secret = new TokenSecret(env, options)
        break
      case 'sign':
        secret = new SignSecret(env, options)
        break
      default:
        throw new TypeError('Unsupported credentials type. Expected basic, token or sign.')
    }

    await keytar.setPassword(secret.service, secret.username, secret.password)

    return true

  }

  static async set(environment, input) {

    try {
      CredentialsManager.delete(input)
    } catch (err) {
      // eslint-disable-line no-empty
    }

    return CredentialsManager.add(input)

  }

}

module.exports = {
  Credentials,
  CredentialsManager
}
