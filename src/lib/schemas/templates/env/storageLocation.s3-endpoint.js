const Base = require('./storageLocation'),
      { sortKeys } = require('../../../utils')

class Template extends Base {

  constructor(name) {
    super('s3-endpoint', name)
  }

  getBoilerplate() {

    return sortKeys(Object.assign(
      super.getBoilerplate(),
      {
        ca: '',
        endpoint: 'https://'
      }
    ))

  }

}

module.exports = Template
