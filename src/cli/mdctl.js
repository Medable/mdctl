const path = require('path'),
      fs = require('fs'),
      yargs = require('yargs'),
      { createTask } = require('./tasks'),
      { privatesAccessor } = require('../utils/privates'),
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
      ))

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

}
