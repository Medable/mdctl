const keytar = require('keytar'),
      { CredentialsProvider } = require('mdctl-core/credentials/provider'),
      { joinPaths } = require('mdctl-core-utils'),
      { rString } = require('mdctl-core-utils/values'),
      { privatesAccessor } = require('mdctl-core-utils/privates')

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

module.exports = KeytarCredentialsProvider
