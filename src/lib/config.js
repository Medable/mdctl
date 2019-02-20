
const { privatesAccessor } = require('./privates'),
      { CredentialsProvider, MemoryProvider } = require('./credentials/provider'),
      { rPath, rBool } = require('./utils/values')

let instance


class CredentialsConfig {

  constructor(config) {
    this.provider = rPath(config, 'provider', new MemoryProvider())
  }

  get provider() {
    return privatesAccessor(this).provider
  }

  set provider(provider) {
    if (!(provider instanceof CredentialsProvider)) {
      throw new TypeError('storage provider must extend CredentialsProvider')
    }
    privatesAccessor(this).provider = provider
  }

}

class ClientConfig {

  constructor(config) {
    this.strictSSL = rPath(config, 'strictSSL')
  }

  get strictSSL() {
    return privatesAccessor(this).strictSSL
  }

  set strictSSL(strictSSL) {
    privatesAccessor(this).strictSSL = rBool(strictSSL, true)
  }

}

class Config {

  constructor() {

    Object.assign(privatesAccessor(this), {
      credentials: new CredentialsConfig(),
      client: new ClientConfig()
    })

  }

  static get global() {
    if (!instance) {
      instance = new Config()
    }
    return instance
  }

  get credentials() {
    return privatesAccessor(this).credentials
  }

  get client() {
    return privatesAccessor(this).client
  }


}

module.exports = {
  Config,
  CredentialsConfig,
  ClientConfig
}
