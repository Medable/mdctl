
/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      sh = require('shelljs'),
      yargs = require('yargs'),
      { throwIfNot } = require('@medable/mdctl-core-utils'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      { createConfig } = require('./config')


class Task {

  constructor(args) {
    Object.assign(privatesAccessor(this), {
      // store cli arguments
      args: createConfig(Object.assign(
        {},
        yargs.options(args || {}).help('').version('').argv,
        process.argv.slice(2)
      )),
    })
  }

  static get synopsis() {
    return ''
  }

  static help() {
    return ''
  }

  static get taskNames() {
    return [this.name.toLowerCase()]
  }

  get args() {
    return privatesAccessor(this).args
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
      }
      if (Array.isArray(command)) {
        return this.exec(...command)
      }
      if (_.isFunction(command)) {
        return !!command()
      }
      return !!command
    }, true))
  }

}

module.exports = Task
