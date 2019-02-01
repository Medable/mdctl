const _ = require('lodash'),
      { Template: Base } = require('../template'),
      { sortKeys } = require('../../../utils')

class Template extends Base {

  constructor(type, name) {
    super('app', type, name)
  }

  getBoilerplate() {

    return sortKeys(
      _.omit(
        Object.assign(
          super.getBoilerplate(),
          {

          }
        )
      ),
      'type'
    )

  }

}

module.exports = Template
