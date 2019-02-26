const { CredentialsProvider } = require('mdctl-core/credentials/provider'),
      { privatesAccessor } = require('mdctl-core-utils')

class MemoryCredentialsProvider extends CredentialsProvider {

  constructor() {

    super()
    privatesAccessor(this).store = new Map()
  }

  async getCredentials(service) {

    const list = privatesAccessor(this).store.get(service)
    if (list) {
      return Array.from(list).map(([account, password]) => ({ account, password }))
    }
    return []
  }

  async setCredentials(service, account, password) {

    let list = privatesAccessor(this).store.get(service)
    if (!list) {
      list = new Map()
      privatesAccessor(this).store.set(service, list)
    }
    list.set(account, password)
  }

  async deleteCredentials(service, account) {

    const list = privatesAccessor(this).store.get(service)
    if (list) {
      return list.delete(account)
    }
    return false
  }

}

module.exports = MemoryCredentialsProvider
