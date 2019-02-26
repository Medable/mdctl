const Base = require('./storageLocation'),
      { sortKeys } = require('mdctl-core-utils')

class Template extends Base {

  constructor(name) {
    super('aws-s3', name)
  }

  getBoilerplate() {

    return sortKeys(Object.assign(
      super.getBoilerplate(),
      {
        region: 'us-east-1'
      }
    ))

  }

}

module.exports = Template
