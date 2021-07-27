/* eslint-disable class-methods-use-this */

const fs = require('fs'),
      _ = require('lodash'),
      pump = require('pump'),
      ndjson = require('ndjson'),
      { isSet, parseString, rString } = require('@medable/mdctl-core-utils/values'),
      { GitLabClient } = require('packages/mdctl-packages'),
      ImportStream = require('@medable/mdctl-core/streams/import_stream'),
      ImportFileTreeAdapter = require('@medable/mdctl-import-adapter'),
      {
        createConfig, loadDefaults
      } = require('../lib/config'),
      Task = require('../lib/task')


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

    const config = createConfig()
    config.update(await loadDefaults())
    this.registryToken = config.get('registryToken')
    this.registryProject = config.get('registryProject')

    this.registry = new GitLabClient({ projectId: this.registryProject, token: this.registryToken })

    return this[handler](cli)
  }

  async 'package@list'(cli) {
    const result = await this.registry.getPackages()
    console.log(result)
  }

  async 'package@get'(cli) {
    const pkg = this.args('2'),
          [name, version] = pkg.split('@'),
          result = await this.registry.getPackage({ name, version })
    return result
  }

  async 'package@publish'(cli) {
    const params = await cli.getArguments(this.optionKeys),
          inputDir = params.dir || process.cwd(),
          packageJson = parseString(fs.readFileSync(`${inputDir}/package.json`)),
          pkg = this.args('2') || `${packageJson.name}@${packageJson.version}`,
          fileAdapter = new ImportFileTreeAdapter(`${inputDir}/${packageJson.mdEnvPath || 'configuration'}`, 'json'),
          importStream = new ImportStream(fileAdapter),
          ndjsonStream = ndjson.stringify(),
          streamList = [importStream, ndjsonStream],
          [name, version] = pkg.split('@')
    await this.registry.publishPackage(name, version, pump(streamList), packageJson.mdDependencies)
    console.log(`${name}@${version} has been published!`)
  }

  async 'package@install'(cli) {
    const pkgs = this.args.clone()._.slice(2),
          // client = await cli.getApiClient({ credentials: await cli.getAuthOptions() }),
          // url = new URL(rString('/org', '/'), client.environment.url),
          // data = await client.call(url.pathname, {
          //   query: {
          //     paths: ['installedPackages']
          //   }
          // }),
          // { installedPackages = {} } = data.data[0],

          // TODO find if the installed packages already have
          // that dependency to avoid downloading an re-install.
          packagesToInstall = await this.registry.getInstallablePackages(pkgs),
          pkgDir = './_pkg_dependencies',
      result = await this.registry.installPackages(pkgDir, packagesToInstall)
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
