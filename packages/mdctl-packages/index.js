const { flatten, orderBy } = require('lodash'),
      { semver } = require('semver'),
      rm = require('rimraf'),
      { SemverResolver } = require('semver-resolver'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      { Fault } = require('@medable/mdctl-core'),
      { ensureDir } = require('@medable/mdctl-node-utils/directory'),
      { FactorySource } = require('./lib')


class PackageResolver {
  constructor(pkg) {
    Object.assign(privatesAccessor(this), { package: pkg })
  }

  get currentPackage () {
    return privatesAccessor(this).package
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

  async doChecks() {
    // TODO: check engine and already installed packages
  }

  async get(name, version, level) {
    const { options, packagesDir } = privatesAccessor(this),
      pkgType = FactorySource(name, version, { options, packagesDir, level }),
      pkgInfo = await pkgType.getPackageInfo()
    return pkgInfo
  }

  async getResolvedPackage(installedVersions = [], dependantPkgs = []) {
    const { package: currentPackage } = privatesAccessor(this),
          isAlreadyInstalled = installedVersions.find(p => p.name === currentPackage.name && p.version === currentPackage.version) ||
            dependantPkgs.find(d => d.name === currentPackage.name && d.version === currentPackage.version)
    if(isAlreadyInstalled) {
      return;
    }
    // check if current package is not already installed
    const pkg = await this.get(currentPackage.name, '.', 0),
          pkgInfo = await pkg.getPackageInfo(),
          deps = this.currentPackage.dependencies

    for(const dependency of Object.keys(deps)) {
      const pkgDep = await this.get(dependency, deps[dependency], 1),
            installed = installedVersions.find(p => p.name === pkgDep.name && p.version === pkgDep.version) ||
              dependantPkgs.find(d => d.name === pkgDep.name && d.version === pkgDep.version)
      if(!installed) {
        const pkgDepInfo = await pkgDep.getPackageInfo()
        if(pkgDepInfo.properties.dependencies && Object.keys(pkgDepInfo.properties.dependencies).length) {
          // discard if already installed or downloaded dependency
          const { pkgInfo: info, dependantPkgs: dependencyPackages } = await (new Package(pkgDepInfo.properties)).evaluate(installedVersions, dependantPkgs)
          for(const d of dependencyPackages) {
            if(dependantPkgs.indexOf(d) < 0) {
              dependantPkgs.push(d)
            }
          }
        }
        dependantPkgs.push(pkgDepInfo)
      }
    }



    // if it has a version check with in registry
    return {
      pkgInfo,
      dependantPkgs
    }
  }
}

class Package {

  constructor(pkg, options) {
    Object.assign(privatesAccessor(this), {
      ...pkg,
      options,
      packagesDir: '_packages',
      packagesDependencies: []
    })
    this.resolver = new PackageResolver(this)
    this.validatePackage()
  }

  async evaluate() {
    return this.resolver.getResolvedPackage()
  }

  get version() {
    return privatesAccessor(this).version
  }

  get name() {
    return privatesAccessor(this).name
  }

  get dependencies() {
    return privatesAccessor(this).dependencies
  }

  validatePackage() {
    const { engines, manifest } = privatesAccessor(this)
    if ((!engines && !engines.cortex) || !manifest) {
      throw Fault.create('mdctl.packages.error', { eason: 'Not a valid medable package' })
    }
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

}
module.exports = Package
