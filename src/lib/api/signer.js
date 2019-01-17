
const { URL } = require('url'),
      { createHmac } = require('crypto'),
      {
        rInt, rString, rDate, isInteger
      } = require('../utils/values'),
      { randomAlphaNum } = require('../utils/crypto')

function sign(command, method, secret, timestamp) {

  const hmac = createHmac('sha256', rString(secret, '')),
        ms = rInt(
          rDate(
            isInteger(timestamp) ? new Date(timestamp) : timestamp,
            new Date()
          ).getTime(),
          0
        )

  hmac.update(
    `${rString(command, '')};${rString(method, '').toUpperCase()};${ms}`
  )

  return {
    timestamp: ms,
    signature: hmac.digest('hex'),
    nonce: randomAlphaNum
  }
}

function signPath(path, key, secret, method = 'GET') {

  const url = new URL(path, 'https://host'),
        command = `/${url.pathname.replace(/\/{2,}/g, '/').replace(/^\/|\/$/g, '')}`

  return sign(
    command,
    method,
    `${key}${secret}`,
    new Date()
  )

}

function signRequest(app, path, method = 'GET') {

  return signPath(
    path,
    app.key,
    app.secret,
    method
  )

}

module.exports = {
  sign,
  signPath,
  signRequest
}
