/* eslint-disable global-require */

const isPlainObject = require('lodash.isplainobject'),
      { privatesAccessor } = require('../../privates'),
      Fault = require('../../fault'),
      { isCustomName, rString } = require('../../utils/values'),
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
        storageLocation: {
          'aws-s3': require('./env/storageLocation.aws-s3'),
          's3-endpoint': require('./env/storageLocation.s3-endpoint')
        },
        object: require('./env/object'),
        script: {
          library: require('./env/script.library'),
          job: require('./env/script.job'),
          route: require('./env/script.route'),
          trigger: require('./env/script.trigger'),
        },
        view: require('./env/view'),
        template: {
          email: require('./env/template.email'),
          push: require('./env/template.push'),
          sms: require('./env/template.sms')
        }
      }


resourceTypes.storage = resourceTypes.storageLocation

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
      throw Fault.create('kInvalidArgument', { reason: `"${rString(object, '')}" is not a valid object. expecting one of: ${Object.keys(resourceTypes)}` })
    }

    if (isPlainObject(Cls)) {

      [type, name] = args

      if (!Cls[type]) {
        throw Fault.create('kInvalidArgument', { reason: `"${rString(type, '')}" is not a valid type for "${object}". expecting one of: ${Object.keys(Cls)}` })
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
