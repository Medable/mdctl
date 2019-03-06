const { Template: Base } = require('../template'),
      { sortKeys } = require('@medable/mdctl-core-utils')

class Template extends Base {

  constructor(name) {
    super('smsNumber', null, name)
  }

  getBoilerplate() {

    return sortKeys(Object.assign(
      super.getBoilerplate(),
      {
        accountSid: '',
        isDefault: true,
        name: this.exportKey,
        number: '+15055555555',
        provider: 'twilio',
      }
    ))

  }

}

module.exports = Template
