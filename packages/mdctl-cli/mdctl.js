const path = require('path'),
      os = require('os'),
      fs = require('fs'),
      _ = require('lodash'),
      yargs = require('yargs'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      { Config } = require('@medable/mdctl-core/config'),
      { Client } = require('@medable/mdctl-api'),
      KeytarCredentialsProvider = require('@medable/mdctl-credentials-provider-keychain'),
      PouchDbCredentialsProvider = require('@medable/mdctl-credentials-provider-pouchdb'),
      { guessEndpoint } = require('@medable/mdctl-core-utils'),
      { loadJsonOrYaml } = require('@medable/mdctl-node-utils'),
      {
        stringToBoolean, rBool, rString, rVal, isSet
      } = require('@medable/mdctl-core-utils/values'),
      {
        randomAlphaNumSym
      } = require('@medable/mdctl-core-utils/crypto'),
      { Fault } = require('@medable/mdctl-core'),
      { createTask } = require('./tasks'),
      { createConfig } = require('./lib/config')

async function readConfig(config, from) {
  let file = from
  if (file.slice(0, 2) === '~/') {
    file = `${os.homedir()}/${file.slice(2)}`
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
      args: createConfig({

        ...yargs.help(false).options({}).argv,
        ...process.argv.slice(2)
      }),

      // the current task
      task: null,

      // the loaded config
      config: {}
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

  get credentialsProvider() {
    return privatesAccessor(this, 'credentialsProvider')
  }

  async run(taskName = process.argv[2]) {

    let err,
        result

    try {

      let args = process.argv.slice(2)
      if (args[1] === '--help') {
        // force help if argument present
        // eslint-disable-next-line no-param-reassign
        taskName = 'help'
        args = process.argv.slice(2).reverse()
      }

      const privates = privatesAccessor(this),
            task = await createTask(this, taskName)

      // get cli arguments and options
      privates.args = createConfig({

        ...yargs.argv,
        ...args
      })

      await this.configure()

      privatesAccessor(this).task = task

      result = await task.run(this)

    } catch (e) {
      err = e
    }
    try {
      await this.credentialsProvider.close()
    } catch (e) {
      // eslint-disable-line no-empty
    }

    if (err) {
      throw err
    }
    return result

  }

  async configure() {

    const privates = privatesAccessor(this),
          config = createConfig(),
          keyProvider = new KeytarCredentialsProvider('com.medable.mdctl'),
          configureDir = path.join(os.homedir(), '.medable')

    let encryptionKey = process.env.MDCTL_CLI_ENCRYPTION_KEY || await keyProvider.getCustom('pouchKey', '*'),
        env = privates.args('env')

    if (!fs.existsSync(configureDir)) {
      fs.mkdirSync(configureDir, { recursive: true })
    }

    if (!encryptionKey) {
      encryptionKey = randomAlphaNumSym(32)
      await keyProvider.setCustom('pouchKey', '*', encryptionKey)
    }

    privates.credentialsProvider = new PouchDbCredentialsProvider({
      name: path.join(configureDir, 'mdctl.db'),
      key: encryptionKey
    })

    config.update({ env })

    // read program config, prefs, then local overrides
    await readConfig(config, path.join(__dirname, './.mdctl.yaml'))
    await readConfig(config, path.join(configureDir, 'mdctl.yaml'))
    await readConfig(config, path.join(__dirname, './.mdctl.local.yaml'))

    // ensure an environment is selected
    env = config('env')
    if (!env) {
      env = config('defaultEnv') || 'dev'
      config.update(env)
    }

    // load environment defaults then reset overrides
    await readConfig(config, path.join(__dirname, 'environments', `${env}.yaml`))
    await readConfig(config, path.join(configureDir, 'mdctl.yaml'))
    await readConfig(config, path.join(__dirname, './mdctl.local.yaml'))

    // ensure correct env is still selected
    config.update({ env })

    // reset configuration
    privates.config = config

    // update module defaults
    Config.global.client.strictSSL = config('strictSSL')
    Config.global.credentials.provider = this.credentialsProvider

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

            const { credentialsProvider } = this,
                  activeCredentials = await credentialsProvider.get(inputCredentials),
                  activeLogin = await credentialsProvider.getCustom('login', '*'),
                  activeClientConfig = _.get(activeLogin, 'client'),
                  isActiveClientReusable = !_.isUndefined(activeLogin)
                    && this.doesClientMatchSecret(activeClientConfig, activeCredentials),
                  client = isActiveClientReusable
                    ? new Client({ credentialsProvider, ...activeClientConfig })
                    : this.createNewClientBy(activeCredentials)

            return { client, activeCredentials }
          },

          getDefaultClientAndCreds = async() => {
            const { credentialsProvider } = this,
                  defaultPasswordSecret = await credentialsProvider.get(this.config('defaultCredentials')),
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
                    : this.createNewClientBy(defaultPasswordSecret)

            return { client, activeCredentials }
          },
          { client, activeCredentials } = options.credentials
            ? await getClientAndCredsFrom(options.credentials)
            : await getDefaultClientAndCreds()

    if (_.isUndefined(client)) {
      throw new Error("Couldn't find any matching credentials")
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

  async getAuthOptions() {

    const args = ['type', 'endpoint', 'env', 'username', 'apiKey', 'token', 'password'],
          options = {},
          env = process.env || {},
          file = (rString(this.args('file')) && await loadJsonOrYaml(this.args('file'))) || {}

    args.forEach((arg) => {
      const value = rVal(this.args(arg), rVal(file[arg], env[`MDCTL_CLI_${arg.toUpperCase()}`]))
      if (isSet(value)) {
        Object.assign(options, { [arg]: value })
      }
    })

    Object.assign(
      options,
      guessEndpoint(options)
    )

    return Object.keys(options).length > 0 ? options : null

  }

  createNewClientBy(credentials) {
    const { credentialsProvider } = this
    return credentials ? new Client({
      environment: _.get(credentials, 'environment.url'),
      credentials,
      sessions: _.get(credentials, 'type') === 'password',
      requestOptions: {
        strictSSL: stringToBoolean(this.config('strictSSL'), true)
      },
      provider: credentialsProvider
    }) : undefined
  }

  doesClientMatchSecret(activeClientConfig, credentials) {
    return !_.isUndefined(credentials) && !_.isUndefined(activeClientConfig)
      && activeClientConfig.environment === credentials.environment.url
      && activeClientConfig.credentials.apiKey === credentials.apiKey
      && activeClientConfig.credentials.username === credentials.username
      && activeClientConfig.credentials.type === credentials.type
  }

  getArguments(arrayOfKeys) {
    const args = _.reduce(arrayOfKeys,
      (sum, key) => _.extend(sum, { [key]: this.args(key) }), {})
    return _.pickBy(args, (v) => !_.isUndefined(v) && v !== null && v !== '')
  }

}
