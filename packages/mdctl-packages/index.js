const { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      { factorySource } = require('./lib')

class Package {

  constructor(name, version, content = null, source = null, options = {}) {
    Object.assign(privatesAccessor(this), {
      name,
      version,
      content,
      options,
      dependantPkgs: [],
      source: source || factorySource(name, version, options)
    })
  }

  shouldIncludePackage(name, version, excludedPackages = {}) {
    return !(excludedPackages[name] && excludedPackages[name].version === version)
  }

  async evaluate(excludePackages = {}) {
    // get source content
    const { source } = privatesAccessor(this)
    if (!source.isInfoLoaded) {
      await source.loadPackageInfo()
    }
    // eslint-disable-next-line no-restricted-syntax
    await this.loadDependencies(source, excludePackages)
    // TODO: when same package has multiple versions what to do?
    // present to the use the ability to choose which version to keep
    return this
  }

  async loadDependencies(source, excludePackages = {}) {
    const { dependantPkgs } = privatesAccessor(this)
    // eslint-disable-next-line no-restricted-syntax
    for (const depName of Object.keys(source.dependencies || {})) {
      const depVersion = source.dependencies[depName],
            pkg = new Package(depName, depVersion, null, null, { ...this.options, level: this.level + 1 })
      // eslint-disable-next-line no-await-in-loop
      await pkg.evaluate(excludePackages)
      if (this.shouldIncludePackage(pkg.name, pkg.version, excludePackages)) {
        dependantPkgs.push(pkg)
        // eslint-disable-next-line no-param-reassign
        excludePackages[pkg.name] = { version: pkg.version, level: pkg.level }
      }
    }
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
    return { [this.name]: this.version }
  }

  toString() {
    return JSON.stringify(this.toJSON())
  }

}
module.exports = Package
