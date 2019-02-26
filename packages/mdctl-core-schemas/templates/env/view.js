const { Template: Base } = require('../template'),
      { sortKeys } = require('mdctl-core-utils')

class Template extends Base {

  constructor(name) {
    super('view', null, name)
  }

  getBoilerplate() {

    return sortKeys(Object.assign(
      super.getBoilerplate(),
      {
        active: true,
        description: this.exportKey,
        label: this.exportKey,
        limit: {
          defaultValue: 100,
          max: 1000,
          min: 1,
          settable: true
        },
        name: this.exportKey,
        objectAcl: [],
        paths: {
          defaultValue: [],
          limitTo: [],
          settable: false
        },
        principal: 'serviceAccount.c_',
        query: [{
          name: 'pipeline',
          value: [
            {
              $match: {
                c_name: 'c_'
              }
            }
          ]
        }],
        skip: {
          defaultValue: 0,
          max: 100000,
          min: 0,
          settable: false
        },
        sourceObject: 'object.c_'
      }
    ))

  }

}

module.exports = Template
