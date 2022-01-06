const { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      { FactorySource } = require('./lib')

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

  shouldIncludePackage(name, version, excludedPackages = {}) {
    // apply semver to match as well
    return !(excludedPackages[name] && excludedPackages[name].version === version)
  }

  async evaluate(excludePackages = {}) {
    // get source content
    const { source, dependantPkgs } = privatesAccessor(this)
    await source.loadPackageInfo()
    // get dependencies
    for(const depName of Object.keys(source.dependencies || {})) {
      const depVersion = source.dependencies[depName],
            pkg = new Package(depName, depVersion, null, {...this.options, level: this.level + 1})
      await pkg.evaluate(excludePackages)
      if(this.shouldIncludePackage(pkg.name, pkg.version, excludePackages)) {
        dependantPkgs.push(pkg)
        excludePackages[pkg.name] = { version: pkg.version, level: pkg.level }
      }
    }

    // TODO: resolve dependencies
    return this


  }

  get options() {
    return privatesAccessor(this).options
  }

  get version() {
    return this.source.version || privatesAccessor(this).version
  }

  get name() {
    return this.source.name || privatesAccessor(this).name
  }

  get level() {
    return this.options.level || 0
  }

  get dependencies() {
    return privatesAccessor(this).options.dependencies
  }

  get dependenciesPackages() {
    return privatesAccessor(this).dependantPkgs
  }

  get source() {
    return privatesAccessor(this).source
  }

  async getPackageStream() {
    return this.source.getStream()
  }

  toJSON() {
    return {[this.name]: this.version}
  }
  toString() {
    return JSON.stringify(this.toJSON())
  }
}
module.exports = Package
