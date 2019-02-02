const Base = require('./app'),
      { sortKeys } = require('../../../utils')

class Template extends Base {

  constructor(name) {
    super('session', name)
  }

  getBoilerplate() {

    return sortKeys(Object.assign(
      super.getBoilerplate(),
      {
        csrf: true,
        sessions: true
      }
    ))

  }

}

module.exports = Template
