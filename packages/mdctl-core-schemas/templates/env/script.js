const { Template: Base } = require('../template'),
      { sortKeys } = require('@medable/mdctl-core-utils')

class Template extends Base {

  constructor(type, name) {
    super('script', type, name)
  }

  getBoilerplate() {

    return sortKeys(Object.assign(
      super.getBoilerplate(),
      {
        script: ''
      }
    ))

  }

}

module.exports = Template
