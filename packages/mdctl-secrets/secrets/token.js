const jsonwebtoken = require('jsonwebtoken'),
      { rString, isSet } = require('@medable/mdctl-core-utils/values'),
      { validateApiKey } = require('@medable/mdctl-core-utils'),
      Secret = require('./base')

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

module.exports = TokenSecret
