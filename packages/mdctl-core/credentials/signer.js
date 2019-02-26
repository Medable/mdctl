
const { URL } = require('url'),
      createHmac = require('create-hmac'),
      { rInt, rString, rDate, isInteger } = require('mdctl-core-utils/values'),
      { randomAlphaNum } = require('mdctl-core-utils')

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
    nonce: randomAlphaNum(16)
  }
}

function signPath(path, apiKey, apiSecret, method = 'GET') {

  const url = new URL(path, 'https://host'),
        command = `/${url.pathname.replace(/\/{2,}/g, '/').replace(/^\/|\/$/g, '')}`

  return sign(
    command,
    method,
    `${apiKey}${apiSecret}`,
    new Date()
  )

}

function signRequest(app, path, method = 'GET') {

  return signPath(
    path,
    app.apiKey,
    app.apiSecret,
    method
  )

}

module.exports = {
  sign,
  signPath,
  signRequest
}
