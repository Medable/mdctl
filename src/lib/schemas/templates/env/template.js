const { Template: Base } = require('../template'),
      { sortKeys } = require('../../../utils')

class Template extends Base {

  constructor(type, name) {
    super('template', type, name)
  }

  getBoilerplate() {

    return sortKeys(Object.assign(
      super.getBoilerplate(),
      {
        description: this.exportKey,
        label: this.exportKey,
        name: this.exportKey
      }
    ))

  }

}

module.exports = Template
