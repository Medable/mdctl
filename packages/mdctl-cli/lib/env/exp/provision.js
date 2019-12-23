const { Client } = require('@medable/mdctl-api'),
      { Config, Fault } = require('@medable/mdctl-core'),
      { isSet } = require('@medable/mdctl-core-utils/values')


module.exports = async(input) => {
  const options = isSet(input) ? input : {},
        client = options.client || new Client({ ...Config.global.client, ...options })

  await client.post('/sys/env/provision', options.params)
}
