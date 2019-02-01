/* eslint-disable global-require */

const isPlainObject = require('lodash.isplainobject'),
      { privatesAccessor } = require('../../privates'),
      Fault = require('../../fault'),
      { isCustomName } = require('../../utils/values'),
      singleton = privatesAccessor({}),
      Template = require('./template'),
      resourceTypes = {
        app: {
          session: require('./env/app.session'),
          signed: require('./env/app.signed')
        },
        notification: require('./env/notification'),
        policy: require('./env/policy'),
        role: require('./env/role'),
        serviceAccount: require('./env/serviceAccount'),
        smsNumber: require('./env/smsNumber'),
        storageLocation: require('./env/storageLocation'),
        object: require('./env/object'),
        script: {
          library: require('./env/script.library'),
          job: require('./env/script.job'),
          route: require('./env/script.route'),
          trigger: require('./env/script.trigger'),
        },
        view: require('./env/view'),
        template: require('./env/template')
      }

class Templates {

  constructor(instance = {}) {
    if (instance !== singleton) {
      throw new Error('This class not creatable')
    }
  }

  static get Template() {
    return Template
  }

  // async because we may implement schemas and caching, which will contain async functionality
  async create(object, ...args) {

    let type,
        name,
        Cls = resourceTypes[object]

    if (!Cls) {
      if (isCustomName(object)) {
        throw Fault.create('kNotImplemented', { reason: 'custom object resource creation is not yet available.' })
      }
      throw Fault.create('kInvalidArgument', { reason: `${object} is not a valid object` })
    }

    if (isPlainObject(Cls)) {

      [type, name] = args

      if (!Cls[type]) {
        throw Fault.create('kInvalidArgument', { reason: `"${type}" is not a valid type for "${object}". expecting one of: ${Object.keys(Cls)}` })
      }

      Cls = Cls[type]

    } else {

      [name] = args

    }

    const tpl = new Cls(name)

    tpl.validateName()

    return tpl

  }

}

module.exports = {
  templates: new Templates(singleton)
}
