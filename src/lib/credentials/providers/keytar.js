const keytar = require('keytar'),

      { CredentialsProvider } = require('./provider'),
      { privatesAccessor } = require('../../privates'),
      { rString } = require('../../utils/values'),
      { joinPaths } = require('../../utils')

class KeytarCredentialsProvider extends CredentialsProvider {

  constructor(keyPrefix) {
    super()
    privatesAccessor(this).keyPrefix = rString(keyPrefix, 'com.medable.mdctl')
  }

  get keyPrefix() {
    return privatesAccessor(this).keyPrefix
  }

  async getCredentials(service) {
    return keytar.findCredentials(joinPaths(this.keyPrefix, service))
  }

  async setCredentials(service, account, password) {
    return keytar.setPassword(joinPaths(this.keyPrefix, service), account, password)
  }

  async deleteCredentials(service, account) {
    return keytar.deletePassword(joinPaths(this.keyPrefix, service), account)
  }

}

module.exports = {
  KeytarCredentialsProvider
}
