const Base = require('./app'),
      { sortKeys } = require('mdctl-core-utils')

class Template extends Base {

  constructor(name) {
    super('signed', name)
  }

  getBoilerplate() {

    return sortKeys(Object.assign(
      super.getBoilerplate(),
      {
        patterns: [],
        principalId: 'account.anonymous',
        principalOverride: false,
        sessions: false
      }
    ))

  }

}

module.exports = Template
