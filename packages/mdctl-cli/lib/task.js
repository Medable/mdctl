/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      sh = require('shelljs'),
      yargs = require('yargs'),
      jsyaml = require('js-yaml'),
      { throwIfNot } = require('@medable/mdctl-core-utils'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      {
        rString, isSet
      } = require('@medable/mdctl-core-utils/values'),
      { createConfig } = require('./config')

class Task {

  constructor(args) {
    Object.assign(privatesAccessor(this), {
      // store cli arguments
      args: createConfig({
        strictSSL: {
          type: 'boolean',
          default: true
        },
        preferUrls: {
          type: 'boolean',
          default: false
        },
        ...yargs.options(args || {}).argv,
        ...process.argv.slice(2)
      }),
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

  static formatOutput(data, format = 'pretty') {

    switch (format) {
      case 'json':
        return JSON.stringify(data)
      case 'pretty':
        return JSON.stringify(data, null, 2)
      case 'yaml':
        return jsyaml.safeDump(data)
      case 'text':
        return data && _.isFunction(data.toString) ? data.toString() : String(data)
      default:
        throw new RangeError('Invalid output format. Expected json, pretty, text or yaml')
    }
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

  mergeJsonArgIf(options, arg) {

    const value = this.args(arg)
    if (rString(value)) {
      const parsed = JSON.parse(value)
      options[arg] = _.merge(options[arg], parsed) // eslint-disable-line no-param-reassign
    }
  }

  applyArgIf(options, arg) {
    const value = this.args(arg)
    if (isSet(value)) {
      options[arg] = value // eslint-disable-line no-param-reassign
    }
  }

}

module.exports = Task
