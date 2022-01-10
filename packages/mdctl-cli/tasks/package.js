/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      { isSet } = require('@medable/mdctl-core-utils/values'),
      Task = require('../lib/task'),
      { publishPkg, installPkg } = require('../lib/package')


class Package extends Task {

  constructor() {

    const options = {
      dryRun: {
        type: 'boolean',
        default: false
      },
      debug: {
        type: 'boolean',
        default: false
      },
      dir: {
        type: 'string',
        default: ''
      }
    }

    super(options)
    this.optionKeys = Object.keys(options)

  }

  async run(cli) {

    const arg1 = this.args('1'),
          handler = `package@${arg1}`

    if (!isSet(arg1)) {
      return console.log(Package.help(cli))
    }

    if (!_.isFunction(this[handler])) {
      throw new Error('Invalid command')
    }

    return this[handler](cli)

  }

  async 'package@get'(cli) {
    throw Error('Not Implemented')
  }

  async 'package@list'(cli) {
    // const result = await this.registry.getPackages()
    // console.log(result)
    throw Error('Not Implemented')
  }

  async 'package@publish'(cli) {
    // Determine where to publish the package i.e either cortex or registry
    const name = this.args('name') || '',
          source = this.args('source') || 'cortex',
          registryUrl = this.args('registryUrl') || process.env.REGISTRY_URL,
          registryProjectId = this.args('registryProjectId') || process.env.REGISTRY_PROJECT_ID,
          registryToken = this.args('registryToken') || process.env.REGISTRY_TOKEN,
          client = await cli.getApiClient({ credentials: await cli.getAuthOptions() })

    await publishPkg(name, {
      source, registryUrl, registryProjectId, registryToken, client
    })
  }

  async 'package@install'(cli) {
    // this will install a package in target organization
    const name = this.args('2') || '',
          registryUrl = this.args('registryUrl') || process.env.REGISTRY_URL,
          registryProjectId = this.args('registryProjectId') || process.env.REGISTRY_PROJECT_ID,
          registryToken = this.args('registryToken') || process.env.REGISTRY_TOKEN,
          client = await cli.getApiClient({ credentials: await cli.getAuthOptions() })

    await installPkg(name, {
      registryUrl, registryProjectId, registryToken, client
    })
  }

  // ----------------------------------------------------------------------------------------------

  static get synopsis() {
    return 'packages tools'
  }

  static help() {

    return `
      Environment environment tools.

      Usage:

        mdctl package [command] [options]

      Arguments:

        command
          get - get a package from repository
          list - get a list of published packages from repository
          publish - publish as package to repository
          install - install a new package

        options
          --dry-run - will skip calling api
    `
  }

}
module.exports = Package
