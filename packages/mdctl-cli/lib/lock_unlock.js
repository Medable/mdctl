const fs = require('fs'),
      { prompt } = require('inquirer'),
      { Fault } = require('@medable/mdctl-core')

class LockUnlock {

  static async lock(dir, endpoint, env = '') {
    const lock = {
      env,
      endpoint
    }
    if (!fs.existsSync(`${dir}/.lock.json`)) {
      fs.writeFileSync(`${dir}/.lock.json`, JSON.stringify(lock))
      console.log(`Workspace ${dir} locked for ${endpoint}/${env}`)
    } else {
      const currentLock = JSON.parse(fs.readFileSync(`${dir}/.lock.json`).toString())
      throw Fault.create('kExists', {
        reason: `Already exist a lock to ${currentLock.endpoint}/${currentLock.env}`,
        path: `${dir}/.lock.json`
      })
    }
  }

  static async unlock(dir) {
    if (!fs.existsSync(`${dir}/.lock.json`)) {
      return console.log('The current workspace is already unlocked')
    }
    const result = await prompt([{
      name: 'unlock',
      message: 'Are you sure you want to unlock this workspace?',
      type: 'confirm',
      default: true
    }])

    if (result.unlock) {
      fs.unlinkSync(`${dir}/.lock.json`)
    }
    return true
  }

  static getCurrentLock(dir) {
    let lock = { endpoint: '', env: '' }
    if (fs.existsSync(`${dir}/.lock.json`)) {
      lock = JSON.parse(fs.readFileSync(`${dir}/.lock.json`).toString())
    }
    return lock
  }

  static allowed(dir, endpoint, env = '') {
    const lock = LockUnlock.getCurrentLock(dir)
    return (!lock.endpoint || lock.endpoint === endpoint) && (lock.env && lock.env !== '*' ? lock.env === env : true)
  }

}

module.exports = LockUnlock
