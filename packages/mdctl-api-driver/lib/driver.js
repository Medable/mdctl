const { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      { randomAlphaNumSym } = require('@medable/mdctl-core-utils/crypto'),
      { loadJsonOrYaml } = require('@medable/mdctl-core-utils'),
      KeytarCredentialsProvider = require('@medable/mdctl-credentials-provider-keychain'),
      PouchDbCredentialsProvider = require('@medable/mdctl-credentials-provider-pouchdb'),
      { Client } = require('@medable/mdctl-api'),
      fs = require('fs'),
      os = require('os'),
      _ = require('lodash'),
      path = require('path'),
      ndjson = require('ndjson'),
      pump = require('pump')


class Driver {

  constructor(client, options = {}) {
    Object.assign(privatesAccessor(this), {
      client,
      options
    })
  }

  static getDefaultDriver() {
    return (async function() {
      const drv = new Driver()
      await drv.getDefaultClient()
      return drv
    }())
  }

  get requestOptions() {
    return privatesAccessor(this, 'options')
  }

  async getCredProvider() {
    const keyProvider = new KeytarCredentialsProvider('com.medable.mdctl'),
          configureDir = path.join(os.homedir(), '.medable')

    let encryptionKey = process.env.MDCTL_CLI_ENCRYPTION_KEY || await keyProvider.getCustom('pouchKey', '*')

    if (!fs.existsSync(configureDir)) {
      fs.mkdirSync(configureDir, { recursive: true })
    }

    if (!encryptionKey) {
      encryptionKey = randomAlphaNumSym(32)
      await keyProvider.setCustom('pouchKey', '*', encryptionKey)
    }

    return new PouchDbCredentialsProvider({
      name: path.join(configureDir, 'mdctl.db'),
      key: encryptionKey
    })
  }

  async loadDefaults() {

    const configureDir = path.join(os.homedir(), '.medable'),
          configureFile = path.join(configureDir, 'mdctl.yaml'),
          localFile = path.join('./mdctl.yaml')

    try {
      let config = null
      if (fs.existsSync(localFile)) {
        config = (await loadJsonOrYaml(localFile))
      }
      if (!config) {
        config = (await loadJsonOrYaml(configureFile))
      }
      return config
    } catch (err) {
      return {}
    }

  }

  async getDefaultClient() {
    const credentialsProvider = await this.getCredProvider(),
          defaultCreds = await this.loadDefaults(),
          defaultPasswordSecret = await credentialsProvider.get(defaultCreds.defaultCredentials),
          activeLogin = await credentialsProvider.getCustom('login', '*'),
          activeClientConfig = _.get(activeLogin, 'client'),
          activeCredentials = activeLogin
            ? {
              username: activeLogin.client.credentials.username,
              apiKey: activeLogin.client.credentials.apiKey,
              password: activeLogin.password
            }
            : defaultPasswordSecret,
          client = activeLogin
            ? new Client(Object.assign(
              activeClientConfig,
              { provider: credentialsProvider, credentials: activeCredentials }
            ))
            : this.createNewClientBy(defaultPasswordSecret, credentialsProvider)

    privatesAccessor(this, 'client', client)
  }

  createNewClientBy(credentials, credentialsProvider) {
    return credentials ? new Client({
      environment: _.get(credentials, 'environment.url'),
      credentials,
      sessions: _.get(credentials, 'type') === 'password',
      requestOptions: {
        strictSSL: false
      },
      provider: credentialsProvider
    }) : undefined
  }

  async client() {
    const client = privatesAccessor(this, 'client')
    if (!client) {
      await this.getDefaultClient()
    }
    return client || privatesAccessor(this, 'client')
  }

  buildUrl(name, op) {
    return `/${name}/db/${op}`
  }

  async cursor(stream, objectName, options = {}) {
    const json = ndjson.parse(),
          reqOptions = Object.assign(_.clone(this.requestOptions), {
            body: JSON.stringify(options),
            method: 'post',
            stream: json,
            requestOptions: {
              json: false,
              headers: { accept: 'application/x-ndjson' }
            }
          })
    const result = await (await this.client()).call(this.buildUrl(objectName, 'cursor'), reqOptions)
    return pump(result, stream)
  }

  async bulk(objectName, options) {
    return (await this.client()).post(this.buildUrl(objectName, 'bulk'), options, this.requestOptions)
  }

  async count(objectName, options = {}) {
    return (await this.client()).post(this.buildUrl(objectName, 'count'), options, this.requestOptions)
  }

  async list(objectName, options = {}) {
    return (await this.client()).post(this.buildUrl(objectName, 'cursor'), options, this.requestOptions)
  }

  async push(objectName, options = {}) {
    return (await this.client()).post(this.buildUrl(objectName, 'push'), options, this.requestOptions)
  }

  async delete(objectName, options = {}) {
    return (await this.client()).post(this.buildUrl(objectName, 'delete'), options, this.requestOptions)
  }

  async deleteMany(objectName, options = {}) {
    return (await this.client()).post(this.buildUrl(objectName, 'deleteMany'), options, this.requestOptions)
  }

  async update(objectName, options = {}) {
    return (await this.client()).post(this.buildUrl(objectName, 'update'), options, this.requestOptions)
  }

  async patch(objectName, options = {}) {
    return (await this.client()).post(this.buildUrl(objectName, 'patch'), options, this.requestOptions)
  }

  async updateOne(objectName, options = {}) {
    return (await this.client()).post(this.buildUrl(objectName, 'updateOne'), options, this.requestOptions)
  }

  async updateMany(objectName, options = {}) {
    return (await this.client()).post(this.buildUrl(objectName, 'updateMany'), options, this.requestOptions)
  }

  async insertOne(objectName, options = {}) {
    return (await this.client()).post(this.buildUrl(objectName, 'insertOne'), options, this.requestOptions)
  }

  async insertMany(objectName, options = {}) {
    return (await this.client()).post(this.buildUrl(objectName, 'insertMany'), options, this.requestOptions)
  }

  async patchOne(objectName, options = {}) {
    return (await this.client()).post(this.buildUrl(objectName, 'patchOne'), options, this.requestOptions)
  }

  async patchMany(objectName, options = {}) {
    return (await this.client()).post(this.buildUrl(objectName, 'patchMany'), options, this.requestOptions)
  }

}

module.exports = Driver
