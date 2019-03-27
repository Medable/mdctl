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
            throw TypeError('Unexpected empty arguments for secret')
          }
          return new secretTypes[type](environment, args)
        }
        throw new TypeError('Unsupported credentials type. Expected password, token or signature.')
      }

// ------------------------------------------------------------------------------------------------

module.exports = {
  Secret,
  createSecret
}
