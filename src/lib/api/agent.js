
const { privatesAccessor } = require('../privates'),
      { rBool, rString, isSet } = require('../utils/values'),
      { signRequest } = require('./signer')

class Agent {

  /**
   * @param input
   *  cookies - boolean. defaults to false.
   *  ssl options -
   *  other agent options.
   */
  constructor(input) {

    const options = isSet(input) ? input : {}

    Object.assign(privatesAccessor(this), {

      // this may be required from some environments (a browser, when supported)
      csrf: rBool(options.csrf, false),

      // the endpoint api key
      key: rString(options.key, ''),

      // the endpoint api secret
      secret: rString(options.secret, '')

    })

  }

}

module.exports = Credentials
