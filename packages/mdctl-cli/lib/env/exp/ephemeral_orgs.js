const { Client } = require('@medable/mdctl-api'),
      { Config, Fault } = require('@medable/mdctl-core'),
      { isSet, pathTo } = require('@medable/mdctl-core-utils/values'),

      provision = async(input) => {
        const options = isSet(input) ? input : {},
              { params } = options,
              client = options.client || new Client({ ...Config.global.client, ...options }),
              body = {}
        let response,
            accountName

        try {

          if (params.fullName) {
            const fullName = params.fullName.split(' ')
            accountName = {
              first: fullName[0],
              last: fullName.length > 1 ? fullName[1] : fullName[0],
            }
          }

          pathTo(body, 'org.code', params.code)
          pathTo(body, 'org.name', params.name)
          pathTo(body, 'org.ttl', params.ttlMs)
          pathTo(body, 'account.email', params.email)
          pathTo(body, 'account.name', accountName)
          pathTo(body, 'account.password', params.password)

          response = await client.post('/sys/env', body)
          return response
        } catch (e) {
          throw Fault.from(e)
        }
      },

      teardown = async(input) => {
        const options = isSet(input) ? input : {},
              { params } = options,
              client = options.client || new Client({ ...Config.global.client, ...options }),
              response = await client.delete(`/sys/env/${params.code}`)
        return response
      }

module.exports = {
  provision,
  teardown
}
