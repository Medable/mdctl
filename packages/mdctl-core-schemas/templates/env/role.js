const { Template: Base } = require('../template'),
      { sortKeys } = require('@medable/mdctl-core-utils')

class Template extends Base {

  constructor(name) {
    super('role', null, name)
  }

  getBoilerplate() {

    return sortKeys(Object.assign(
      super.getBoilerplate(),
      {
        code: this.exportKey,
        include: [],
        name: this.exportKey,
        scope: []
      }
    ))

  }

}

module.exports = Template
