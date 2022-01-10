const { privatesAccessor } = require('@medable/mdctl-core-utils/privates')


class Source {

  constructor(name, path, options = {}) {
    Object.assign(privatesAccessor(this), {
      name,
      path,
      options
    })
  }

  get name() {
    return privatesAccessor(this).name
  }

  get level() {
    return this.options.level || 0
  }

  get version() {
    return privatesAccessor(this).version
  }

  get path() {
    return privatesAccessor(this).path
  }

  get dependencies() {
    return privatesAccessor(this).dependencies
  }

  get engine() {
    return privatesAccessor(this).engine
  }

  get options() {
    return privatesAccessor(this).options
  }

  get type() {
    return this.constructor.name
  }

  async loadPackageInfo() {
    throw new Error('Must be implement on inherited sources')
  }

  async getStream() {
    throw new Error('Must be implement on inherited sources')
  }

}

module.exports = Source
