/* eslint-disable class-methods-use-this */

const jsonwebtoken = require('jsonwebtoken'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      {
        rString, isSet,
      } = require('@medable/mdctl-core-utils/values'),
      { pathTo, validateApiKey, validateApiSecret } = require('@medable/mdctl-core-utils'),
      { signPath } = require('./signer')

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

module.exports = {
  Secret,
  TokenSecret,
  SignatureSecret,
  PasswordSecret
}
