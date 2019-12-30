const { Client } = require('@medable/mdctl-api'),
      { Config, Fault } = require('@medable/mdctl-core'),
      { isSet, stringToBoolean } = require('@medable/mdctl-core-utils/values')


module.exports = async(input) => {
  const options = isSet(input) ? input : {},
        { params } = options,
        client = options.client || new Client({ ...Config.global.client, ...options })
  let response
  try {
    const body = {
      org: {
        code: params.code,
        name: params.orgName || params.code,
        ephemeral: params.ephemeral ? stringToBoolean(params.ephemeral) : false
      },
      account: {
        email: params.email
      }
    }
    if (params.fullName) {
      const fullName = params.fullName.split(' ')
      Object.assign(body.account, {
        name: {
          first: fullName[0],
          last: fullName.length > 1 ? fullName[1] : fullName[0],
        }
      })
    }
    response = await client.post('/sys/env/provision', body)
    return response
  } catch (e) {
    throw Fault.from(e)
  }
}
