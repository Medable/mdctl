const cloneObject = require('clone'),
      path = require('path'),
      fs = require('fs'),
      os = require('os'),
      sh = require('shelljs'),
      jsyaml = require('js-yaml'),
      { merge } = require('lodash'),
      { loadJsonOrYaml, pathTo } = require('mdctl-core-utils'),
      { privatesAccessor } = require('mdctl-core-utils/privates')

let Undefined

class Config {

  constructor() {
    Object.assign(privatesAccessor(this), {
      data: {},
      cache: new Map(),
      Undefined: Object.create({})
    })
  }

  get(propertyPath, defaultValue = Undefined) {

    const privates = privatesAccessor(this)

    let value = privates.cache.get(propertyPath)
    if (value === Undefined) {
      value = pathTo(privates.data, propertyPath)
      privates.cache.set(propertyPath, value === Undefined ? privates.Undefined : value)
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

    const accessor = (propertyPath, defaultValue) => this.get(propertyPath, defaultValue),
          {
            get, match, update, clone, flush, load
          } = this

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

async function clearDefaults() {

  const configureDir = path.join(os.homedir(), '.medable'),
        configureFile = path.join(configureDir, 'mdctl.yaml')

  try {
    fs.unlinkSync(configureFile)
  } catch (err) {
    // eslint-disable-line no-empty
  }
  return true
}

async function loadDefaults() {

  const configureDir = path.join(os.homedir(), '.medable'),
        configureFile = path.join(configureDir, 'mdctl.yaml')

  try {
    return (await loadJsonOrYaml(configureFile))
  } catch (err) {
    return {}
  }

}

async function writeDefaults(contents) {

  const configureDir = path.join(os.homedir(), '.medable'),
        configureFile = path.join(configureDir, 'mdctl.yaml'),
        local = await loadDefaults()

  merge(local, contents)

  sh.mkdir('-p', `${configureDir}`)
  fs.writeFileSync(
    configureFile,
    `# ------------------------------------------------\n${
      jsyaml.safeDump(local)
    }# ------------------------------------------------\n`,
    'utf8'
  )

  return true

}


module.exports = {
  Config,
  createConfig,
  config: createConfig(),
  loadDefaults,
  clearDefaults,
  writeDefaults
}
