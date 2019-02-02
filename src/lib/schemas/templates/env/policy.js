const { Template: Base } = require('../template'),
      { sortKeys } = require('../../../utils')

class Template extends Base {

  constructor(name) {
    super('policy', null, name)
  }

  getBoilerplate() {

    return sortKeys(Object.assign(
      super.getBoilerplate(),
      {
        aclBlacklist: [],
        aclWhitelist: [],
        action: 'Deny',
        active: true,
        appBlacklist: [],
        appWhitelist: [],
        condition: 'and',
        faultCode: 'kAccessDenied',
        faultReason: 'Access denied by policy',
        faultStatusCode: 403,
        halt: false,
        ipBlacklist: [],
        ipWhitelist: [],
        label: this.exportKey,
        methods: [],
        name: this.exportKey,
        paths: [],
        priority: 0,
        rateLimit: true,
        rateLimitCount: 300,
        rateLimitElements: ['ip'],
        rateLimitReason: 'Too many requests',
        rateLimitWindow: 300,
        redirectStatusCode: 307,
        trace: false
      }
    ))

  }

}

module.exports = Template
