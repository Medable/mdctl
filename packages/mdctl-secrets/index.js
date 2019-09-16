/* eslint-disable class-methods-use-this */

const Secret = require('./secrets/base'),
      PasswordSecret = require('./secrets/password'),
      TokenSecret = require('./secrets/token'),
      SignatureSecret = require('./secrets/signature'),
      secretTypes = {
        password: PasswordSecret,
        token: TokenSecret,
        signature: SignatureSecret
      },
      createSecret = (type, environment, args) => {
        if (secretTypes[type]) {
          if (!args) {
            throw new TypeError('Unexpected empty arguments for secret')
          }
          return new secretTypes[type](environment, args)
        }
        // returns anonymous secret
        if(!args.apiKey) {
          throw new TypeError('Unexpected empty apiKey argument')
        }
        return new Secret(null, environment, null, args.apiKey)
      }

// ------------------------------------------------------------------------------------------------

module.exports = {
  Secret,
  createSecret
}
