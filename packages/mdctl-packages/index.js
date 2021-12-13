const { semver } = require('semver'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      { Fault } = require('@medable/mdctl-core'),
      { FactorySource } = require('./lib')


class PackageResolver {
  constructor(pkg) {
    Object.assign(privatesAccessor(this), { pkg })
  }

  get currentPackage () {
    return privatesAccessor(this).pkg
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



  async getResolvedPackage(installedVersions = [], dependantPkgs = []) {
    const { pkg: currentPackage } = privatesAccessor(this),
          isAlreadyInstalled = installedVersions.find(p => p.name === currentPackage.name && p.version === currentPackage.version) ||
            dependantPkgs.find(d => d.name === currentPackage.name && d.version === currentPackage.version)
    if(isAlreadyInstalled) {
      return;
    }
    // check if current package is not already installed
    const { pkg } = await this.getSource(currentPackage.name, currentPackage.version, {level: 0, ...currentPackage.options}),
          pkgInfo = await pkg.getPackageInfo(),
          deps = this.currentPackage.dependencies || {}

    for(const dependency of Object.keys(deps)) {
      const { pkg: pkgDepInfo } = await this.getSource(dependency, deps[dependency], { level: 1 }),
            installed = installedVersions.find(p => p.name === pkgDepInfo.name && p.version === pkgDepInfo.version) ||
              dependantPkgs.find(d => d.name === pkgDepInfo.name && d.version === pkgDepInfo.version)
      if(!installed && pkgDepInfo) {
        if(pkgDepInfo.properties.dependencies && Object.keys(pkgDepInfo.properties.dependencies).length) {
          // discard if already installed or downloaded dependency
          const { dependantPkgs: dependencyPackages } = await (new Package(pkgDepInfo.properties, currentPackage.options)).evaluate(installedVersions, dependantPkgs)
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

  constructor(name, version, content = null, options = {}) {
    Object.assign(privatesAccessor(this), {
      name,
      version,
      content,
      options,
      dependantPkgs: [],
      source: FactorySource(name, version, options)
    })
  }

  async evaluate(excludePackages = []) {
    // get source content
    const { source, dependantPkgs } = privatesAccessor(this)
    await source.loadInfo()
    // get dependencies contents
    for(const depName of Object.keys(source.dependencies)) {
      const depVersion = source.dependencies[depName],
            pkg = new Package(depName, depVersion, null, { parent: this.name })
      await pkg.evaluate()
      dependantPkgs.push(pkg)
    }
    // resolve dependencies
    return source.dependencies


  }

  get options() {
    return privatesAccessor(this).options
  }

  get version() {
    return privatesAccessor(this).version
  }

  get name() {
    return privatesAccessor(this).name
  }

  get dependencies() {
    return privatesAccessor(this).options.dependencies
  }

}
module.exports = Package
