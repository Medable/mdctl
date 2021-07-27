const { flatten, orderBy } = require('lodash'),
      { semver } = require('semver'),
      rm = require('rimraf'),
      SemverResolver = require('semver-resolver'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      { Fault } = require('@medable/mdctl-core'),
      { ensureDir } = require('@medable/mdctl-node-utils/directory'),
      { FactorySource } = require('./lib')

class Package {

  constructor(pkg, config) {
    Object.assign(privatesAccessor(this), {
      ...pkg,
      config,
      packagesDir: '_packages'
    })
    this.validatePackage()
    ensureDir(privatesAccessor(this).packagesDir)
  }

  validatePackage() {
    const { engines, manifest } = privatesAccessor(this)
    if (!engines.cortex || !manifest) {
      throw Fault.create('mdctl.packages.error', { eason: 'Not a valid medable package' })
    }
  }

  async sortVersions(versions, options = {}) {
    const {
      includePreReleases = true,
      clean = true
    } = options

    let sortedVersions = versions
      .map(version => version.trim())
      .map(version => [
        version,
        semver.clean(version, {
          loose: true,
          includePrerelease: true
        }) || semver.valid(semver.coerce(version))
      ])
      .filter(version => version[1])
      .sort((a, b) => semver.rcompare(a[1], b[1]))

    if (!includePreReleases) {
      sortedVersions = sortedVersions.filter(version => semver.prerelease(version[1]) === null)
    }

    if (clean) {
      return sortedVersions.map(version => version[1])
    }

    return sortedVersions.map(([version]) => version)
  }

  cleanUpPackages(pkg, packages) {
    let selectedVersion
    const { name, version } = pkg
    if (!packages[name]) {
      throw Fault.create('mdctl.error.packageNotFound', { reason: `Package ${name} not found in registry` })
    }
    if (!version || version === 'latest') {
      // eslint-disable-next-line prefer-destructuring
      selectedVersion = packages[name] && packages[name][0]
    } else if (version.indexOf('^') === 0 || version.indexOf('~') === 0) {
      selectedVersion = packages[name] && packages[name].find(v => semver.satisfies(v, version))
    } else {
      selectedVersion = packages[name] && packages[name].find(v => v === version)
    }
    if (!selectedVersion) {
      throw Fault.create('mdctl.error.packageNotFound', { reason: `Package ${version} not found in registry` })
    }
    return { name, version: selectedVersion }
  }

  async doChecks() {
    // TODO: check engine and already installed packages
  }

  async publish(name, version, data, dependencies) {
    const streams = [{
      data,
      name: `${name}_${version}.json`
    }]
    if (dependencies) {
      streams.push({
        data: Buffer.from(JSON.stringify(dependencies)),
        name: 'dependencies.json'
      })
    }
    // eslint-disable-next-line one-var
    const compressed = await this.compressStream(streams)
    // TODO: send it to the registry
    return compressed
  }

  async package(name, version, level) {
    const { config, packagesDir } = privatesAccessor(this),
          pkgType = FactorySource(name, version, { config, packagesDir, level }),
          pkgInfo = await pkgType.getPackageInfo()
    return pkgInfo
  }

  async processDependencies(dependencies, packages, level = 0) {
    // eslint-disable-next-line no-restricted-syntax
    for (const dep of Object.keys(dependencies)) {
      // package item
      // eslint-disable-next-line no-await-in-loop
      const pkg = await this.package(dep, dependencies[dep], level)
      if (pkg) {
        packages.push(pkg)
        if (pkg.properties.dependencies && Object.keys(pkg.properties.dependencies).length > 0) {
          // TODO check if we already have that dependency loaded
          // eslint-disable-next-line no-await-in-loop
          await this.processDependencies(pkg.properties.dependencies, packages, level + 1)
        }
      } else {
        throw Error(`Package ${dep} not found or not a valid package.`)
      }
    }
  }

  // mdctl pkg install - will read mpmrc to search for package.json and include source
  // mdctl pkg install . - will read mpmrc to search for package.json and include source
  // mdctl pkg install file:// or git+https:// ... - will clone/search these packages
  async install(includeSource = false) {

    const { name, dependencies, config } = privatesAccessor(this),
          packages = []
    try {
      if (includeSource) {
        // package source first.
        packages.push(await this.package(name, './'))
      }

      await this.processDependencies(dependencies, packages)
      const localPkgs = packages.filter(p => p.type === 'FileSource'),
            // remove duplicates give precedence to locale packages.
            // TODO: set highest level to local packages if there is same dependency since that needs to go first.
            pkgs = [...localPkgs, ...packages.filter(p => !localPkgs.find(lp => lp.properties.name === p.properties.name && lp.properties.version === p.properties.version))]

      // Resolve dependencies
      // const resolvedDeps = this.resolveDependencies(packages)
      // console.log(resolvedDeps)

      // obtain full packages from sources
      const sortedPkgs = orderBy(pkgs, 'level', 'desc'),
            streams = await Promise.all(sortedPkgs.map(p => p.getStream()))

      // now we have the streams to send to backend.
      console.log(streams)

      rm.sync(privatesAccessor(this).packagesDir)

      // hit cortex to check already installed packages.
    } catch (ex) {
      console.log(ex)
      throw ex
    }
  }

  getAllDeps(packages) {
    const deps = flatten(packages
                  .filter(p => Object.keys(p.properties.dependencies).length > 0)
                  .map(p => p.properties.dependencies))
    // TODO: check if some of the dependencies are among the local packages.

  }

  resolveDependencies(packages) {
    const pkgDependencies = this.getAllDeps(packages),
          pkgs = packages.reduce((obj, p) => {
            // eslint-disable-next-line no-param-reassign
            obj[p.properties.name] = p.properties.version
            return obj
          }, {}),
          cleaned = pkgDependencies.map(p => this.cleanUpPackages(p, pkgs))
    console.log(pkgDependencies, pkgs, cleaned)
  }


}
module.exports = Package
