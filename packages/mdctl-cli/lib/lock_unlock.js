const _ = require('lodash'),
      fs = require('fs'),
      { prompt } = require('inquirer'),
      globby = require('globby'),
      { Fault } = require('@medable/mdctl-core'),
      { parseString, stringifyContent } = require('@medable/mdctl-core-utils/values'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates')

class LockUnlock {

  constructor(dir, endpoint, env, actions) {
    Object.assign(privatesAccessor(this), {
      config: globby.sync(['workspace.{json,yaml}'], { cwd: dir }),
      endpoint,
      env,
      actions,
      dir
    })
    if (privatesAccessor(this).config.length > 1) {
      throw Fault.create('kConfigConflict', {
        reason: 'There are two config files in the directory, please remove one of the workspace files.'
      })
    }
  }

  get configFile() {
    const configPath = privatesAccessor(this).config.length ? privatesAccessor(this).config[0] : 'workspace.json'
    return `${this.dir}/${configPath}`
  }

  get dir() {
    return privatesAccessor(this).dir
  }

  get endpoint() {
    return privatesAccessor(this).endpoint
  }

  get env() {
    return privatesAccessor(this).env
  }

  get actions() {
    return privatesAccessor(this).actions
  }

  get format() {
    const fileName = this.configFile,
          re = /(?:\.([^.]+))?$/
    return re.exec(fileName)[1]
  }

  writeConfig(payload) {
    if (this.configFile) {
      fs.writeFileSync(this.configFile, stringifyContent(payload, this.format))
    }
  }

  readConfig() {
    let data = []
    if (this.configFile) {
      try {
        data = parseString(fs.readFileSync(this.configFile), this.format)
      } catch (e) {
        throw Fault.from(e)
      }
    }
    return data
  }

  formatEndpoint(endpoint) {
    return `https://api.${endpoint}.medable.com`
  }

  async addLock() {
    const lock = {
      env: this.env,
      endpoint: this.endpoint,
      actions: this.actions
    }
    if (!fs.existsSync(this.configFile)) {
      this.writeConfig([lock])
      console.log(`Workspace ${this.configFile} locked for ${this.endpoint}/${this.env}`)
    } else {
      let currentLock = this.readConfig()
      const existingForEndpoint = _.filter(currentLock, cl => cl.endpoint === this.endpoint),
            existingLock = _.find(existingForEndpoint, cl => cl.env === this.env),
            existingWithWildCardIdx = _.findIndex(existingLock, cl => cl.env === '*')
      if (!existingLock) {
        if ((this.env === '' || this.env === '*') && existingForEndpoint.length > 0) {
          const result = await prompt([{
            name: 'wildcard',
            message: 'There is an existing env lock for the endpoint and you are adding a wildcard lock. Do you want to remove env lock/s and keep this new one?',
            type: 'confirm',
            default: true
          }])
          if (result.wildcard) {
            currentLock = _.filter(currentLock, cl => cl.endpoint !== this.endpoint)
            lock.env = lock.env || '*'
            currentLock.push(lock)
          }
        } else if (existingWithWildCardIdx > -1) {
          const result = await prompt([{
            name: 'wildcard',
            message: 'There is an existing wildcard lock for that endpoint, you want to remove the wildcard lock and add this new env lock?',
            type: 'confirm',
            default: true
          }])
          if (result.wildcard) {
            currentLock.splice(existingWithWildCardIdx, 1)
            currentLock.push(lock)
          }
        } else {
          lock.env = lock.env || '*'
          currentLock.push(lock)
        }
        this.writeConfig(currentLock)
      } else {
        throw Fault.create('kExists', {
          reason: `Lock already exists for ${existingLock.endpoint}/${existingLock.env}`
        })
      }
    }
  }

  async removeLock() {
    if (!fs.existsSync(this.configFile)) {
      throw Fault.create('kNotFoundLockFile', {
        reason: `There is no lock in current workspace: ${this.configFile}`
      })
    } else {
      let currentLock = this.readConfig()
      // eslint-disable-next-line max-len
      currentLock = _.filter(currentLock, cl => cl.endpoint !== this.endpoint && (this.env !== '' ? cl.env !== this.env : true))
      this.writeConfig(currentLock)
    }
  }

  async clearLocks() {
    if (!fs.existsSync(this.configFile)) {
      return console.log('The current workspace is already unlocked')
    }
    const result = await prompt([{
      name: 'unlock',
      message: 'Are you sure you want to unlock this workspace?',
      type: 'confirm',
      default: true
    }])

    if (result.unlock) {
      fs.unlinkSync(this.configFile)
    }
    return true
  }

  getCurrentLocks() {
    let locks = []
    if (fs.existsSync(this.configFile)) {
      locks = this.readConfig()
    }
    return locks
  }

  checkLock(actions = ['import', 'export']) {
    const locks = this.getCurrentLocks(),
          lock = _.find(locks, l => this.formatEndpoint(l.endpoint) === this.endpoint && (l.env && l.env !== '*' ? l.env === this.env : true))
    // also add check for actions
    if (lock) {
      const matchingActions = lock.actions.filter(e => actions.indexOf(e) !== -1)
      return matchingActions.length > 0
    }
    return false
  }

}

module.exports = LockUnlock
