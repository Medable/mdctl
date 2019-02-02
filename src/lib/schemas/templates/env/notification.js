const { Template: Base } = require('../template'),
      { sortKeys } = require('../../../utils')

class Template extends Base {

  constructor(name) {
    super('notification', null, name)
  }

  getBoilerplate() {

    return sortKeys(Object.assign(
      super.getBoilerplate(),
      {
        duplicates: false,
        endpoints: [
          {
            configurable: true,
            name: 'sms',
            state: 'Enabled',
            template: `template.${this.exportKey}`
          },
          {
            configurable: true,
            name: 'email',
            state: 'Enabled',
            template: `template.${this.exportKey}`
          },
          {
            configurable: true,
            name: 'push',
            state: 'Enabled',
            template: `template.${this.exportKey}`
          }
        ],
        label: this.exportKey,
        name: this.exportKey,
        persists: false
      }
    ))

  }

}

module.exports = Template
