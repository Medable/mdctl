const { Template: Base } = require('../template'),
      { sortKeys } = require('mdctl-core-utils')

class Template extends Base {

  constructor(name) {
    super('serviceAccount', null, name)
  }

  getBoilerplate() {

    return sortKeys(Object.assign(
      super.getBoilerplate(),
      {
        label: this.exportKey,
        locked: false,
        name: this.exportKey,
        roles: []
      }
    ))

  }

}

module.exports = Template
