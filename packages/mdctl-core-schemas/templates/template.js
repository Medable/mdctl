const { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      { joinPaths, sortKeys } = require('@medable/mdctl-core-utils'),
      { isCustomName, isExportKey } = require('@medable/mdctl-core-utils/values'),
      Fault = require('@medable/mdctl-core')

class Template {

  constructor(object, type, exportKey) {

    Object.assign(privatesAccessor(this), {
      object,
      type,
      exportKey
    })
  }

  get object() {
    return privatesAccessor(this).object
  }

  get type() {
    return privatesAccessor(this).type
  }

  get resource() {
    return joinPaths(this.object, this.type, this.exportKey)
  }

  get exportKey() {
    return privatesAccessor(this).exportKey
  }

  validateName(throwError = true) {

    const validator = isCustomName(this.object) ? isExportKey : isCustomName,
          valid = Boolean(validator(this.exportKey))

    if (!valid && throwError) {
      throw Fault.create('kInvalidArgument', {
        reason: `The resource name "${this.exportKey}" is invalid. expected a c_ or namespaced resource (or a uuid for custom data instances)`,
        path: this.resource

      })
    }

    return valid

  }

  getBoilerplate() {

    const object = {
      object: this.object,
      resource: this.resource
    }
    if (this.type) {
      object.type = this.type
    }

    return sortKeys(object)

  }

}

module.exports = {
  Template
}
