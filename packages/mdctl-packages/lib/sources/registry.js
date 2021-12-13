const { SemverResolver } = require('semver-resolver'),
      Source = require('./source')

class RegistrySource extends Source {


  async getPackageInfo() {
    throw Error('Not Implemented')
  }

  async getStream() {

  }

  // TODO: implement some version resolution
  // SemverResolver
}

module.exports = RegistrySource
