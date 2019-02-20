const { isSet } = require('../utils/values'),
      { Config } = require('../config')

module.exports = {

  async export(input) {

    const options = isSet(input) ? input : {},
          client = options.client || Config.global.client

    return client.call()

  }

}
