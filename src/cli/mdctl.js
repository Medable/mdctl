const path = require('path'),
      fs = require('fs'),
      _ = require('lodash'),
      yargs = require('yargs'),
      { privatesAccessor } = require('../lib/privates'),
      { createTask } = require('./tasks'),
      Client = require('../lib/api/client'),
      { CredentialsManager } = require('../lib/api/credentials'),
      { loadJsonOrYaml } = require('../lib/utils'),
      { stringToBoolean, rBool } = require('../lib/utils/values'),
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
        yargs.help('').version('').argv,
        process.argv.slice(2)
      )),

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

  async getDefaultCredentials() {

    const configureDir = path.join(process.env.HOME, '.medable'),
          configureFile = path.join(configureDir, 'mdctl.yaml')

    try {
      return (await loadJsonOrYaml(configureFile))
    } catch (err) {
      return {}
    }

  }

  async getApiClient(options = {}) {

    const ensureSession = rBool(options.testStatus, true),
          getClientAndCredsFrom = async(passwordSecret) => {
            const activeLogin = await CredentialsManager.getCustom('login', '*'),
                  activeClientConfig = _.get(activeLogin, 'client'),
                  isActiveClientReusable = !!activeLogin,
                  // !_.isUndefined(activeLogin) &&
                  // this.doesClientMatchSecret(activeClientConfig, passwordSecret),
                  client = isActiveClientReusable
                    ? new Client(activeClientConfig)
                    : this.createNewClientBy(passwordSecret),
                  activeCredentials = _.pick(passwordSecret, ['username', 'password'])

            return { client, activeCredentials }
          },
          getDefaultClientAndCreds = async() => {
            const defaultPasswordSecret = await CredentialsManager.get(this.config('defaultCredentials')),
                  activeLogin = await CredentialsManager.getCustom('login', '*'),
                  activeClientConfig = _.get(activeLogin, 'client'),
                  client = activeLogin
                    ? new Client(activeClientConfig)
                    : this.createNewClientBy(defaultPasswordSecret),
                  activeCredentials = activeLogin
                    ? {
                      username: activeLogin.client.credentials.username,
                      password: activeLogin.password
                    }
                    : _.pick(defaultPasswordSecret, ['username', 'password'])

            return { client, activeCredentials }
          },
          { client, activeCredentials } = options.passwordSecret
            ? getClientAndCredsFrom(options.passwordSecret)
            : getDefaultClientAndCreds()

    if (_.isUndefined(client)) {
      throw new Error("API client didn't start, try logging-in first or storing secrets to the keystore")
    }

    // is there an active login, attempt to resurrect it.
    if (ensureSession) await this.resurrectClient(client, activeCredentials)

    return client
  }

  async resurrectClient(client, passwordSecret) {
    try {
      await client.get('/accounts/me', { query: { paths: ['_id'] } })
    } catch (err) {
      // attempt to recover by logging in again.
      switch (err.code) {
        case 'kNotLoggedIn':
        case 'kLoggedInElsewhere':
        case 'kCSRFTokenMismatch':
        case 'kSessionExpired':
          await client.post('/accounts/login', { email: passwordSecret.username, password: passwordSecret.password })
          break
        default:
          throw err
      }
    }
  }

  createNewClientBy(passwordSecret) {
    return passwordSecret ? new Client({
      environment: _.get(passwordSecret, 'environment.url'),
      credentials: _.get(passwordSecret, 'credentials'),
      sessions: _.get(passwordSecret, 'credentials.authType') === 'password',
      requestOptions: {
        strictSSL: stringToBoolean(this.config('strictSSL'), true)
      }
    }) : undefined
  }

  doesClientMatchSecret(activeClientConfig, passwordSecret) {
    return !_.isUndefined(passwordSecret) && !_.isUndefined(activeClientConfig)
      && activeClientConfig.environment === passwordSecret.environment.url
      && activeClientConfig.credentials.apiKey === passwordSecret.apiKey
      && activeClientConfig.credentials.username === passwordSecret.username
  }

  async getArguments(arrayOfKeys) {
    return _.reduce(arrayOfKeys,
      (sum, key) => _.extend(sum, { [key]: this.args(key) }), {})
  }

}
