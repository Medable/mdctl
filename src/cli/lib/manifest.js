
const _ = require('lodash'),
      { privatesAccessor } = require('../../lib/privates'),
      { rArray } = require('../../lib/utils/values')

// Augmented regular expresions. Accepts strings, star
class ARegex {

  constructor(input) {
    let value
    if (_.isString(input)) {
      value = /^\//.test(input) && /\/$/.test(input)
        ? new RegExp(input.substring(1, input.length - 1))
        : input
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
      dependencies: definition.dependencies || true,
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

  shouldIncludeDependencies() {
    return privatesAccessor(this, 'dependencies')
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
          // [last, ...prefix] = path.split('.').reverse(),
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


    if (def.scripts) thisInternals.scripts = new ManifestStage(def.scripts)
    if (def.views) thisInternals.views = new ManifestStage(def.views)
    if (def.templates) thisInternals.templates = new ManifestStage(def.templates)
    if (def.apps) thisInternals.apps = new ManifestStage(def.apps)
    if (def.roles) thisInternals.roles = new ManifestStage(def.roles)
    if (def.serviceAccounts) thisInternals.serviceAccounts = new ManifestStage(def.serviceAccounts)
    if (def.policies) thisInternals.policies = new ManifestStage(def.policies)
    if (def.notifications) thisInternals.notifications = new ManifestStage(def.notifications)
    if (def.storage) thisInternals.storage = new ManifestStage(def.storage)

    Object.assign(privatesAccessor(this), thisInternals)
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

  get storage() {
    return privatesAccessor(this, 'storage')
  }

}

module.exports = { Manifest, ARegex }
