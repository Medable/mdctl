
const { privatesAccessor } = require('../privates'),
      { rString, isSet } = require('../utils/values'),
      { signRequest } = require('./signer')

class App {

  constructor(input) {

    const options = isSet(input) ? input : {}

    Object.assign(privatesAccessor(this), {

      // the endpoint api key
      key: rString(options.key, ''),

      // the endpoint api secret
      secret: rString(options.secret, '')

    })

  }

  get csrf() {
    return privatesAccessor(this).csrf
  }

  get signed() {
    return !!privatesAccessor(this).secret
  }

  signRequest(path, method) {
    return signRequest(this, path, method)
  }

}

module.exports = App
