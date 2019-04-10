const { rString, isSet } = require('@medable/mdctl-core-utils/values'),
      { pathTo } = require('@medable/mdctl-core-utils'),
      Secret = require('./base')

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

module.exports = PasswordSecret
