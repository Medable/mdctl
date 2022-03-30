const { RegistrySource } = require('@medable/mdctl-packages/lib')

class Registry {

  constructor(name, version, options) {

    this.source = new RegistrySource(name, version, options)

  }

  async publishPackage(zipStream) {

    await this.source.publishPackage(zipStream)

  }

}

module.exports = Registry
