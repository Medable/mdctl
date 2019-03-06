const Base = require('./script'),
      { sortKeys } = require('@medable/mdctl-core-utils')

class Template extends Base {

  constructor(name) {
    super('trigger', name)
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
