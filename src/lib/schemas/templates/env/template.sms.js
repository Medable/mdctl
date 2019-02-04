const Base = require('./template'),
      { sortKeys } = require('../../../utils')

class Template extends Base {

  constructor(name) {
    super('sms', name)
  }

  getBoilerplate() {

    return sortKeys(Object.assign(
      super.getBoilerplate(),
      {
        localizations: [
          {
            locale: 'en_US',
            content: [
              {
                data: 'text message',
                name: 'message'
              }
            ]
          }
        ]
      }
    ))

  }

}

module.exports = Template
