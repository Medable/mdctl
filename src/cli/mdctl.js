const path = require('path'),
      fs = require('fs'),
      yargs = require('yargs'),
      { privatesAccessor } = require('../lib/privates'),
      { createTask } = require('./tasks'),
      Client = require('../lib/api/client'),
      Environment = require('../lib/api/environment'),
      { CredentialsManager } = require('../lib/api/credentials'),
      { loadJsonOrYaml } = require('../lib/utils'),
      { stringToBoolean, rBool, isSet } = require('../lib/utils/values'),
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

  async getApiClient(input) {

    const options = isSet(input) ? input : {},
          ensureSession = rBool(options.testStatus, true),
          activeLogin = await CredentialsManager.getCustom('login', '*'),
          defaultCredentials = this.config('defaultCredentials')

    let client

    // is there an active login, attempt to resurrect it.
    if (activeLogin) {

      client = new Client(activeLogin.client)

      if (!ensureSession) {
        return client
      }

      try {

        await client.get('/accounts/me', { query: { paths: ['_id'] } })
        return client

      } catch (err) {

        // attempt to recover by logging in again.
        switch (err.code) {
          case 'kNotLoggedIn':
          case 'kLoggedInElsewhere':
          case 'kCSRFTokenMismatch':
          case 'kSessionExpired':
            await client.post('/accounts/login', { email: activeLogin.client.credentials.username, password: activeLogin.password })
            return client
          default:
            throw err
        }

      }

    }

    if (defaultCredentials) {

      const environment = new Environment(defaultCredentials),
            secret = await CredentialsManager.get(defaultCredentials)

      if (secret) {

        const { credentials, username: email, password } = secret

        client = new Client({
          environment,
          credentials,
          sessions: credentials.authType === 'password',
          requestOptions: {
            strictSSL: stringToBoolean(this.config('strictSSL'), true)
          }
        })

        if (credentials.authType !== 'password' || !ensureSession) {
          return client
        }

        await client.post('/accounts/login', { email, password })
        return client

      }

    }

    throw new Error('No credentials were found that could automatically authorize.')

  }


}
