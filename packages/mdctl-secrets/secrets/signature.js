const { rString, isSet } = require('@medable/mdctl-core-utils/values'),
      { validateApiKey, validateApiSecret } = require('@medable/mdctl-core-utils'),
      Secret = require('./base'),
      { signPath } = require('./signer')

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

module.exports = SignatureSecret
