const Base = require('./template'),
      { sortKeys } = require('mdctl-core-utils')

class Template extends Base {

  constructor(name) {
    super('email', name)
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
                data: '<span>html body</span>',
                name: 'html'
              },
              {
                data: 'plain text body',
                name: 'plain'
              },
              {
                data: 'subject line',
                name: 'subject'
              }
            ]
          }
        ]
      }
    ))

  }

}

module.exports = Template
