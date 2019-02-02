
const { privatesAccessor } = require('../../../src/lib/privates'),
      { CredentialsProvider } = require('./credentials')

class MemoryProvider extends CredentialsProvider {

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

module.exports = MemoryProvider
