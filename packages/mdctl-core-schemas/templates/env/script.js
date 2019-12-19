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
        script: '',
        language: 'javascript/es6',
        name: this.exportKey,
        optimized: false,
        principal: null,
        label: this.exportKey
      }
    ))

  }

}

module.exports = Template
