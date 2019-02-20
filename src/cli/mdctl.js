const path = require('path'),
      fs = require('fs'),
      _ = require('lodash'),
      yargs = require('yargs'),
      { privatesAccessor } = require('../lib/privates'),
      { createTask } = require('./tasks'),
      Client = require('../lib/api/client'),
      { CredentialsManager, KeytarCredentialsProvider } = require('../lib/credentials'),
      { loadJsonOrYaml } = require('../lib/utils'),
      Fault = require('../lib/fault'),
      { stringToBoolean, rBool, rString } = require('../lib/utils/values'),
      { createConfig } = require('./lib/config')

async function readConfig(config, from) {
  let file = from
  if (file.slice(0, 2) === '~/') {
    file = `${process.env.HOME}/${file.slice(2)}`
  }
  if (fs.existsSync(file)) {
    await config.load(file)
  }

}

module.exports = class MdCtlCli {

  constructor() {

    Object.assign(privatesAccessor(this), {

      // store cwd
      cwd: process.cwd(),

      // store cli arguments
      args: createConfig(Object.assign(
        {},
        yargs.options({
          format: {
            default: 'json',
            type: 'string'
          },
          manifest: {
            default: '',
            type: 'string'
          },
          layout: {
            default: 'tree',
            type: 'string'
          }
        }).help('').version('').argv,
        process.argv.slice(2)
      )),

      // the current task
      task: null,

      // the loaded config
      config: {},

      credentialsManager: new CredentialsManager({
        prefix: 'com.medable.mdctl',
        provider: new KeytarCredentialsProvider()
      })

    })

  }

  get cwd() {
    return privatesAccessor(this, 'cwd')
  }

  get config() {
    return privatesAccessor(this, 'config')
  }

  get args() {
    return privatesAccessor(this, 'args')
  }

  get task() {
    return privatesAccessor(this, 'task')
  }

  get credentialsManager() {
    return privatesAccessor(this, 'credentialsManager')
  }

  async run(taskName = process.argv[2]) {

    const privates = privatesAccessor(this),
          task = createTask(taskName)

    // get cli arguments and options
    privates.args = createConfig(Object.assign(
      {},
      yargs.help('').version('').argv,
      process.argv.slice(2)
    ))

    await this.configure()

    privatesAccessor(this).task = task

    return task.run(this)

  }

  async configure() {

    const privates = privatesAccessor(this),
          config = createConfig()

    let env = privates.args('env')

    config.update({ env })

    // read program config, prefs, then local overrides
    await readConfig(config, path.join(__dirname, './.mdctl.yaml'))
    await readConfig(config, path.join(process.env.HOME, '.medable', 'mdctl.yaml'))
    await readConfig(config, path.join(__dirname, './.mdctl.local.yaml'))

    // ensure an environment is selected
    env = config('env')
    if (!env) {
      env = config('defaultEnv') || 'dev'
      config.update(env)
    }

    // load environment defaults then reset overrides
    await readConfig(config, path.join(__dirname, 'environments', `${env}.yaml`))
    await readConfig(config, path.join(process.env.HOME, '.medable', 'mdctl.yaml'))
    await readConfig(config, path.join(__dirname, './mdctl.local.yaml'))

    // ensure correct env is still selected
    config.update({ env })

    // reset configuration
    privates.config = config

  }

  /**
   *  Get an authenticated api client.
   *
   * @param options
   *  credentials (optional)
   *    Secret, or plain object options used to look up secrets.
   *  resurrect (optional, default true)
   *    When true, attempts to resurrect an existing password login session
   *
   *
   * @returns {Promise<void>}
   */
  async getApiClient(options = {}) {

    const getClientAndCredsFrom = async(inputCredentials) => {

            const { credentialsManager } = this,
                  activeCredentials = await credentialsManager.get(inputCredentials),
                  activeLogin = await credentialsManager.getCustom('login', '*'),
                  activeClientConfig = _.get(activeLogin, 'client'),
                  isActiveClientReusable = !_.isUndefined(activeLogin)
                    && this.doesClientMatchSecret(activeClientConfig, activeCredentials),
                  client = isActiveClientReusable
                    ? new Client(Object.assign({ credentialsManager }, activeClientConfig))
                    : this.createNewClientBy(activeCredentials)

            return { client, activeCredentials }
          },

          getDefaultClientAndCreds = async() => {
            const { credentialsManager } = this,
                  defaultPasswordSecret = await credentialsManager.get(this.config('defaultCredentials')),
                  activeLogin = await credentialsManager.getCustom('login', '*'),
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
                      { credentialsManager, credentials: activeCredentials }
                    ))
                    : this.createNewClientBy(defaultPasswordSecret)


            return { client, activeCredentials }
          },
          { client, activeCredentials } = options.credentials
            ? await getClientAndCredsFrom(options.credentials)
            : await getDefaultClientAndCreds()

    if (_.isUndefined(client)) {
      throw new Error("API client didn't start, try logging-in first or storing secrets to the keystore")
    }

    // is there an active login, attempt to resurrect it.
    // this won't do much unless there's a session attached to the client.
    if (activeCredentials && client.credentials.type === 'password' && rBool(options.resurrect, true)) {
      await this.resurrectClient(client, activeCredentials)
    }

    return client
  }

  async resurrectClient(client, credentials) {

    let err
    try {
      const result = await client.get('/accounts/status', { query: { paths: ['_id'] } })
      err = Fault.from(result.fault, false)
      if (!err && !result.loggedin) {
        await client.post('/accounts/login', { email: credentials.username, password: credentials.password })
      }
    } catch (e) {
      err = e
    }
    if (err) {
      // attempt to recover by logging in again.
      switch (err.code) {
        case 'kNotLoggedIn':
        case 'kLoggedInElsewhere':
        case 'kCSRFTokenMismatch':
        case 'kSessionExpired':
          await client.post('/accounts/login', { email: credentials.username, password: credentials.password })
          break
        default:
          throw err
      }
    }
  }

  assignArgIf(options, arg) {

    const value = this.args(arg)
    if (rString(value)) {
      Object.assign(options, { [arg]: value })
    }
  }


  async getAuthOptions() {

    const options = {}

    if (rString(this.args('file'))) {
      const file = await loadJsonOrYaml(this.args('file'))
      Object.assign(options, _.pick(file, 'type', 'endpoint', 'env', 'username', 'apiKey'))
    }

    this.assignArgIf(options, 'type')
    this.assignArgIf(options, 'endpoint')
    this.assignArgIf(options, 'env')
    this.assignArgIf(options, 'username')
    this.assignArgIf(options, 'apiKey')

    return Object.keys(options).length > 0 ? options : null

  }

  createNewClientBy(credentials) {
    const { credentialsManager } = this
    return credentials ? new Client({
      environment: _.get(credentials, 'environment.url'),
      credentials,
      sessions: _.get(credentials, 'type') === 'password',
      requestOptions: {
        strictSSL: stringToBoolean(this.config('strictSSL'), true)
      },
      credentialsManager
    }) : undefined
  }

  doesClientMatchSecret(activeClientConfig, credentials) {
    return !_.isUndefined(credentials) && !_.isUndefined(activeClientConfig)
      && activeClientConfig.environment === credentials.environment.url
      && activeClientConfig.credentials.apiKey === credentials.apiKey
      && activeClientConfig.credentials.username === credentials.username
  }

  getArguments(arrayOfKeys) {
    const args = _.reduce(arrayOfKeys,
      (sum, key) => _.extend(sum, { [key]: this.args(key) }), {})
    return _.pickBy(args, _.identity)
  }

}
