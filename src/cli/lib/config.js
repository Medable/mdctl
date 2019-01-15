'use strict'

const cloneObject = require('clone'),
      { merge } = require('lodash'),
      { loadJsonOrYaml } = require('../../utils'),
      pathTo = require('../../utils/path.to'),
      { privatesAccessor } = require('../../utils/privates')

let Undefined

class Config {

  constructor() {
    Object.assign(privatesAccessor(this), {
      data: {},
      cache: new Map(),
      Undefined: Object.create({})
    })
  }

  get(path, defaultValue = Undefined) {

    const privates = privatesAccessor(this)

    let value = privates.cache.get(path)
    if (value === Undefined) {
      value = pathTo(privates.data, path)
      privates.cache.set(path, value === Undefined ? privates.Undefined : value)
    }
    if (value === privates.Undefined || value === Undefined) {
      value = defaultValue !== Undefined ? defaultValue : Undefined
    }
    return value
  }

  clone() {
    return cloneObject(privatesAccessor(this).data)
  }

  update(data) {
    merge(privatesAccessor(this).data, data)
    this.flush()
  }

  flush() {
    privatesAccessor(this).cache.clear()
  }

  match(matcher) {

    const privates = privatesAccessor(this)

    return Object.keys(privates.data).reduce((matches, key) => {
      const m = key.match(matcher)
      if (m) {
        matches.push({ key, value: privates.data[key], matches: m })
      }
      return matches
    }, [])
  }

  getAccessor() {

    const accessor = (path, defaultValue) => this.get(path, defaultValue),
          { get, match, update, clone, flush, load } = this

    Object.assign(accessor, {
      instance: this,
      get: get.bind(this),
      match: match.bind(this),
      update: update.bind(this),
      clone: clone.bind(this),
      flush: flush.bind(this),
      load: load.bind(this)
    })

    return accessor

  }

  async load(file) {
    try {
      this.update(await loadJsonOrYaml(file))
    } catch (err) {
      return false
    }
    return true
  }

}

function createConfig(data) {

  const instance = new Config()
  instance.update(data)
  return instance.getAccessor()

}

module.exports = {
  Config,
  createConfig,
  config: createConfig()
}
