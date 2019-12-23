/* eslint-disable class-methods-use-this */
/* eslint-disable no-await-in-loop */

const { stringToBoolean, rVal, rString } = require('@medable/mdctl-core-utils/values'),
      Task = require('../lib/task'),
      {
        clearDefaults, createConfig, loadDefaults, writeDefaults
      } = require('../lib/config'),
      { question } = require('../lib/questionnaires'),
      configureOptions = {
        defaultEndpoint: {
          message: 'The default cortex endpoint',
          default: 'api.dev.medable.com',
          transform: v => rString(v, '')
        },
        defaultEnv: {
          message: 'The default endpoint env (org code)',
          default: '',
          transform: v => rString(v, '')
        },
        defaultAccount: {
          message: 'The default account email',
          default: '',
          transform: v => rString(v, '')
        },
        strictSSL: {
          message: 'Verify endpoint ssl certificates by default. Use only for debugging.',
          default: true,
          transform: v => stringToBoolean(v, true)
        },
        experimental: {
          message: 'Enable experimental features.',
          default: false,
          transform: v => stringToBoolean(v, false)
        }
      }

class Configure extends Task {

  constructor() {
    super({
      clean: {
        type: 'boolean',
        default: false
      },
      show: {
        type: 'boolean',
        default: false
      },
      quiet: {
        type: 'boolean',
        default: false
      }
    })
  }

  async run(cli) {

    const isClean = this.args('clean'),
          show = this.args('show'),
          keys = Object.keys(configureOptions),
          local = {},
          localCfg = createConfig() // attempt to re-read the config from the configure file.

    if (isClean) {
      return clearDefaults()
    }

    if (show) {
      return console.log(await loadDefaults())
    }

    try {
      localCfg.update(await loadDefaults())
    } catch (err) {
      // eslint-disable-line no-empty
    }

    // eslint-disable-next-line max-len,no-restricted-syntax
    for (const k of keys) {
      const argument = this.args(k)
      if (typeof argument === 'string') {
        local[k] = (configureOptions[k]).transform(argument)
      }
    }
    if (Object.keys(local).length > 0) {
      return writeDefaults(local)
    }

    for (let i = 0; i < keys.length; i += 1) {

      const key = keys[i],
            entry = configureOptions[key]

      local[key] = entry.transform(await question(
        entry.message,
        rVal(localCfg(key) || cli.config(key) || entry.default, '')
      ))

    }

    return writeDefaults(local)

  }

  static get synopsis() {
    return 'configure defaults'
  }

  static help() {
    return `    
    Configure defaults
    
    Usage: 
      
      mdctl configure [options]
          
    Arguments:               
                
      options     
        --clean - clear current preferences and exit              
        --quiet - suppress confirmations
        --show - show current configurations
        --experimental - (true/false) enables experimental features                      
    `
  }

}

module.exports = Configure
