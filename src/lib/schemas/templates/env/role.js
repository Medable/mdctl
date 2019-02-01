const { Template: Base } = require('../template'),
      { sortKeys } = require('../../../utils')

class Template extends Base {

  constructor(type, name) {
    super('role', type, name)
  }

  getBoilerplate() {

    return sortKeys(Object.assign(
      super.getBoilerplate(),
      {

      }
    ))

  }

}

module.exports = Template
