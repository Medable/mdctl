
const jsonwebtoken = require('jsonwebtoken'),
      { privatesAccessor } = require('../privates'),
      { rString, isSet } = require('../utils/values'),
      { signPath } = require('./signer')

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
    return !!privatesAccessor(this).apiKey
  }

  /**
   * @param input
   *  type    detected based on options force to: ['auto', token', 'signed', 'basic', 'none']
   *  path    required for signed requests (default '/')
   *  method  required for signed requests (default 'GET')
   *  principal optional. for signed requests.
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
      } else if (privates.secret) {
        type = 'signed'
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

      case 'signed':

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
            headers['medable-client-principal'] = principal
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

module.exports = Credentials
