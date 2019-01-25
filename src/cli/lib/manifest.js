
const { privatesAccessor } = require('../../utils/privates'),
      { validateRegex, rArray } = require('../../utils/values'),
      { throwIfNot } = require('../../utils'),
      _ = require('lodash')


// Augmented regular expresions. Accepts strings, star
class ARegex {

  constructor(input) {
    if (_.isString(input)) {
      this.value = /^\//.test(input) && /\/$/.test(input)
        ? new RegExp(input.substring(1,input.length-1))
        : input
    }
    if (_.isRegExp(input)) {
      this.value = input
    }
  }

  test(pattern) {
    if (_.isString(this.value)) {
      return this.value === '*' || _.isEqual(pattern, this.value)
    } else if (_.isRegExp(this.value)) {
      return this.value.test(pattern)
    }

    return false
  }
}

// Basic matching stage
class ManifestStage {

  constructor(def) {
    def = def || {}

    if (!def.includes) {
      def.includes = ['*']
    }

    this.includes = rArray(def.includes || [], true).map(v => new ARegex(v))
    this.excludes = rArray(def.excludes || [], true).map(v => new ARegex(v))
  }

  accept(path) {
    const [head, _] = path

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
    this._key = key
    this[key] = new ARegex(def[key])
  }

  accept(path) {
    const [last, ...prefix] = path.split('.').reverse(),
          [first] = path.split('.')

    if (this[this._key]) return this[this._key].test(first)

    return false
  }

}


class Manifest extends ManifestStage {

  constructor(def) {
    def = def || {}

    super(def)

    if (def.objects) {
      this.objects = def.objects.map(section => new ObjectSection(section, 'name'))
    }

    // @todo: add all other sections, scripts, views, templates, env...

  }

  accept(path) {
    // Global include/exclude works on the last item of the path
    const [last, _] = path.split('.').reverse(),
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
