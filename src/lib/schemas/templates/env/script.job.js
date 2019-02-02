const Base = require('./script'),
      { sortKeys } = require('../../../utils')

class Template extends Base {

  constructor(name) {
    super('job', name)
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
