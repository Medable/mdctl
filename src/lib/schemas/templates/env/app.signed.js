const Base = require('./app'),
      { sortKeys } = require('../../../utils')

class Template extends Base {

  constructor(name) {
    super('signed', name)
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
