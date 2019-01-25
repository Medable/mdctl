
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
    const [last, ...prefix] = path.split('.').reverse(),
      [first, ...rest] = path.split('.')

    return this.includes.some(r => r.test(last))
      && !this.excludes.some(r => r.test(last))
  }

}


class ObjectManifest {

  constructor(def) {
    def = def || {}

    if (!def.includes) {
      def.includes = ['.*']
    }

    if (!def.name) {
      throw new Error('Invalid Argument')
    }

    this.name = /^\//.test(def.name) && /\/$/.test(def.name)
      ? def.name.substring(1,def.name.length-1)
      : def.name
    this.includes = rArray(def.includes || [], true)
    this.excludes = rArray(def.excludes || [], true)
  }

  accept(path) {
    const [last, ...prefix] = path.split('.').reverse(),
          [first] = path.split('.')

    if (this.name) return new RegExp(this.name).test(first)

    return this.includes.some(r => new RegExp(r).test(last))
      && !this.excludes.some(r => new RegExp(r).test(last))
  }

}


class Manifest extends ManifestStage {

  constructor(def) {
    def = def || {}

    super(def)
    //
    // if (!def.includes) {
    //   def.includes = ['.*']
    // }
    //
    // if (def.objects) {
    //   this.objects = def.objects.map(section => new ObjectManifest(section))
    // }
    //
    // this.includes = rArray(def.includes || [], true)
    // this.excludes = rArray(def.excludes || [], true)
  }

  // accept(path) {
  //   const [last, ...prefix] = path.split('.').reverse(),
  //         [first, ...rest] = path.split('.')
  //
  //   if (this[first]) {
  //     return this[first].some(section => section.accept(...rest))
  //   }
  //
  //   return this.includes.some(r => new RegExp(r).test(last))
  //     && !this.excludes.some(r => new RegExp(r).test(last))
  // }


}

module.exports = { Manifest, ARegex }
