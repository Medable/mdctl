const keytar = require('keytar'),
      { privatesAccessor } = require('../privates')

let Undefined

class CredentialsProvider {

  static get() {
    return privatesAccessor(this).provider
  }

  static set(provider) {

    if (!(provider instanceof CredentialsProvider)) {
      throw new TypeError('storage provider must extend CredentialsProvider')
    }
    privatesAccessor(this).provider = provider
  }

  // eslint-disable-next-line no-unused-vars
  async getCredentials(service) {
    return []
  }

  // eslint-disable-next-line no-unused-vars
  async setCredentials(service, account, password) {
    return Undefined
  }

  // eslint-disable-next-line no-unused-vars
  async deleteCredentials(service, account) {
    return false
  }

}

class KeytarCredentialsProvider extends CredentialsProvider {

  async getCredentials(service) {
    return keytar.findCredentials(service)
  }

  async setCredentials(service, account, password) {
    return keytar.setPassword(service, account, password)
  }

  async deleteCredentials(service, account) {
    return keytar.deletePassword(service, account)
  }

}

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


CredentialsProvider.set(new KeytarCredentialsProvider())


module.exports = {
  CredentialsProvider,
  KeytarCredentialsProvider,
  MemoryProvider
}
