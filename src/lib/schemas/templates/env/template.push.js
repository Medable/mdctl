const Base = require('./template'),
      { sortKeys } = require('../../../utils')

class Template extends Base {

  constructor(name) {
    super('push', name)
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
                data: 'push message',
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
