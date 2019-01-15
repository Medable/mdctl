
/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      sh = require('shelljs'),
      { throwIfNot } = require('../../utils')

class Task {

  static get synopsis() {
    return ''
  }

  static help() {
    return ''
  }

  run() {
    return new Promise((resolve, reject) => reject(new Error('promises promises...)')))
  }

  exec(command, options) {
    return sh.exec(command, options).code === 0
  }

  cd(to) {
    return sh.cd(to).code === 0
  }

  assert(message, failed, ...commands) {
    if (message) {
      console.log(message)
    }
    throwIfNot(failed, commands.reduce((success, command) => {
      if (!success) return false
      if (_.isString(command)) {
        return this.exec(command)
      } else if (Array.isArray(command)) {
        return this.exec(...command)
      } else if (_.isFunction(command)) {
        return !!command()
      }
      return !!command
    }, true))
  }

}

module.exports = Task
