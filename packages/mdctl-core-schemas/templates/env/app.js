const _ = require('lodash'),
      { Template: Base } = require('../template'),
      { sortKeys } = require('mdctl-core-utils')

class Template extends Base {

  constructor(type, name) {
    super('app', type, name)
  }

  getBoilerplate() {

    return sortKeys(
      _.omit(
        Object.assign(
          super.getBoilerplate(),
          {
            authDuration: 900,
            blacklist: [],
            cors: [],
            enabled: true,
            expires: null,
            expose: false,
            label: this.exportKey,
            maxTokensPerPrincipal: 10,
            name: this.exportKey,
            readOnly: false,
            whitelist: [],
          }
        ),
        'type'
      )
    )

  }

}

module.exports = Template
