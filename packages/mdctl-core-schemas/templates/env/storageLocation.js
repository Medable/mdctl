const { Template: Base } = require('../template'),
      { sortKeys } = require('mdctl-core-utils')

class Template extends Base {

  constructor(type, name) {
    super('storageLocation', type, name)
  }

  getBoilerplate() {

    return sortKeys(Object.assign(
      super.getBoilerplate(),
      {
        accessKeyId: '',
        active: false,
        bucket: '',
        exportTtlDays: 7,
        label: this.exportKey,
        managed: true,
        name: this.exportKey,
        passive: true,
        prefix: '',
        readUrlExpiry: 900
      }
    ))

  }

}

module.exports = Template
