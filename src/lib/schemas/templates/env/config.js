const { Template: Base } = require('../template'),
      { sortKeys } = require('../../../utils')

class Template extends Base {

  constructor(name) {
    super('config', null, name)
  }

  getBoilerplate() {

    return sortKeys(Object.assign(
      super.getBoilerplate(),
      {
        name: this.exportKey,
        value: {}
      }
    ))

  }

}

module.exports = Template
