
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

  accept(path) {
    const [head] = path

    return this.includes.some(r => r.test(head))
      && !this.excludes.some(r => r.test(head))
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
          [first] = path.split('.')

    if (keyTester) return keyTester.test(first)
    return false
  }

}

class Manifest extends ManifestStage {

  constructor(input) {
    const def = input || {}

    super(def)

    if (def.objects) {
      this.objects = def.objects.map(section => new ObjectSection(section, 'name'))
    }

    // @todo: add all other sections, scripts, views, templates, env...

  }

  accept(path) {
    // Global include/exclude works on the last item of the path
    const [last] = path.split('.').reverse(),
          [first, ...rest] = path.split('.')

    // dispatsh acceptance to appropriate section
    if (this[first]) {
      return this[first].some(section => section.accept(rest.join('.')))
    }

    return this.includes.some(r => r.test(last))
      && !this.excludes.some(r => r.test(last))
  }


}

module.exports = { Manifest, ARegex }
