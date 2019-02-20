
const { privatesAccessor } = require('./privates'),
      { CredentialsProvider, MemoryProvider } = require('./credentials/provider'),
      { rPath } = require('./utils/values')

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


class Config {

  constructor() {

    Object.assign(privatesAccessor(this), {
      credentials: new CredentialsConfig()
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
    return privatesAccessor(this).credentials
  }


}

module.exports = {
  Config,
  CredentialsConfig
}
