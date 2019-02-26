
const { privatesAccessor } = require('mdctl-core-utils/privates'),
  { CredentialsProvider } = require('./credentials/provider'),
  MemoryCredentialsProvider = require('./credentials/memory_provider'),
  { rPath, rBool } = require('mdctl-core-utils/values'),
  { normalizeEndpoint, validateEndpoint } = require('mdctl-core-utils')

let instance

class EnvironmentConfig {

  constructor(config) {
    this.endpoint = rPath(config, 'endpoint')
    this.env = rPath(config, 'env')

  }

  get endpoint() {
    return privatesAccessor(this).endpoint
  }

  set endpoint(endpoint) {

    const value = normalizeEndpoint(endpoint)
    if (!validateEndpoint(value)) {
      throw new TypeError(`environment endpoint "${endpoint}" is invalid`)
    }
    privatesAccessor(this).endpoint = value
  }

  get env() {
    return privatesAccessor(this).env
  }

  set env(env) {
    privatesAccessor(this).env = env
  }

}

class CredentialsConfig {

  constructor(config) {
    this.provider = rPath(config, 'provider', new MemoryCredentialsProvider())
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
      client: new ClientConfig(),
      environment: new EnvironmentConfig({ endpoint: 'https://localhost', env: 'example', version: 'v2' })
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

  get environment() {
    return privatesAccessor(this).environment
  }

}

module.exports = {
  Config,
  CredentialsConfig,
  ClientConfig,
  EnvironmentConfig
}
