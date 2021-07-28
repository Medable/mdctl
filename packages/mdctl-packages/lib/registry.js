const Source = require('./source')

class RegistrySource extends Source {


  async get() {
    throw Error('Not Implemented')
  }

  async publish() {
    throw Error('Not Implemented')
  }

  static async search(filter = {}) {
    throw Error('Not Implemented')
  }

  async getPackageInfo() {
    throw Error('Not Implemented')
  }
}

module.exports = RegistrySource
