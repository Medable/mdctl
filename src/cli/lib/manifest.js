
const _ = require('lodash'),
      { privatesAccessor } = require('../../lib/privates'),
      { rArray, isSet, isCustom } = require('../../lib/utils/values')

// Augmented regular expresions. Accepts strings, star
class ARegex {

  constructor(input) {
    let value
    if (_.isString(input)) {
      const match = input.match(/^\/(.*)\/(.*)/)
      value = match ? new RegExp(match[1], match[2]) : input
    }
    if (_.isRegExp(input)) {
      value = input
    }

    Object.assign(privatesAccessor(this), { value })
  }

  test(pattern) {
    const value = privatesAccessor(this, 'value')
    if (_.isString(value)) {
      return value === '*' || _.isEqual(pattern, value)
    } if (_.isRegExp(value)) {
      return value.test(pattern)
    }

    return false
  }

}

// Basic matching stage
class ManifestStage {

  constructor(input) {
    const definition = input || {}

    if (!definition.includes) {
      definition.includes = ['*']
    }

    Object.assign(privatesAccessor(this), {
      dependencies: definition.dependencies,
      includes: rArray(definition.includes || [], true).map(v => new ARegex(v)),
      excludes: rArray(definition.excludes || [], true).map(v => new ARegex(v))
    })
  }

  get includes() {
    return privatesAccessor(this, 'includes')
  }

  get excludes() {
    return privatesAccessor(this, 'excludes')
  }

  get dependencies() {
    return privatesAccessor(this, 'dependencies')
  }

  shouldIncludeDependencies() {
    return this.dependencies
  }

  accept(path) {
    return this.includes.some(r => r.test(path))
      && !this.excludes.some(r => r.test(path))
  }

}

class ObjectSection extends ManifestStage {

  constructor(def, key) {
    super(def)

    if (!def[key]) {
      throw new Error('Invalid Argument')
    }

    Object.assign(privatesAccessor(this), {
      key,
      keyTester: new ARegex(def[key])
    })
  }

  accept(path) {
    const keyTester = privatesAccessor(this, 'keyTester'),
          [first, ...rest] = path.split('.')

    if (keyTester) {

      return keyTester.test(first)
        && (!rest.length || super.accept(rest.join('.')))
    }
    return false
  }

}

class Manifest extends ManifestStage {

  constructor(input) {
    const def = input || {},
          thisInternals = {}

    super(def)

    if (def.objects) {
      thisInternals.objects = def.objects.map(section => new ObjectSection(section, 'name'))
    }

    // We defien a section for each built-in name
    Manifest.builtInSections.forEach((name) => {
      if (def[name]) {
        thisInternals[name] = new ManifestStage(def[name])
      }
    })

    // We also define a section for each custom name to capture user data
    Object.keys(def)
      .filter(isCustom)
      .forEach((name) => {
        if (def[name]) {
          thisInternals[name] = new ManifestStage(def[name])
          Object.defineProperty(this, name, {
            get: () => privatesAccessor(this, name)
          })
        }
      })

    Object.assign(privatesAccessor(this), thisInternals)
  }

  static get builtInSections() {
    return ['env', 'scripts', 'views', 'templates', 'apps', 'roles', 'serviceAccounts',
      'policies', 'notifications', 'storageLocations']
  }

  accept(path) {
    // Global include/exclude works on the last item of the path
    const [last] = path.split('.').reverse(),
          [first, ...rest] = path.split('.')

    // dispatch acceptance to appropriate section
    if (this[first]) {
      return _.isArray(this[first])
        ? this[first].some(section => section.accept(rest.join('.')))
        : this[first].accept(rest.join('.'))
    }

    return this.includes.some(r => r.test(last))
      && !this.excludes.some(r => r.test(last))
  }

  shouldIncludeDependencies(path) {
    const [head, ...tail] = path.split('.'),
          res = this[head] && tail.length && this.head.shouldIncludeDependencies(tail.join('.'))

    if (isSet(res)) return res
    return this.dependencies
  }

  get env() {
    return privatesAccessor(this, 'env')
  }

  get objects() {
    return privatesAccessor(this, 'objects')
  }

  get scripts() {
    return privatesAccessor(this, 'scripts')
  }

  get views() {
    return privatesAccessor(this, 'views')
  }

  get templates() {
    return privatesAccessor(this, 'templates')
  }

  get apps() {
    return privatesAccessor(this, 'apps')
  }

  get roles() {
    return privatesAccessor(this, 'roles')
  }

  get serviceAccounts() {
    return privatesAccessor(this, 'serviceAccounts')
  }

  get policies() {
    return privatesAccessor(this, 'policies')
  }

  get notifications() {
    return privatesAccessor(this, 'notifications')
  }

  get storageLocations() {
    return privatesAccessor(this, 'storageLocations')
  }

}

module.exports = { Manifest, ARegex }
