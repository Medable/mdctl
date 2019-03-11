/* eslint-disable class-methods-use-this */
/* eslint-disable no-await-in-loop */

const Task = require('../lib/task'),
      {
        clearDefaults, createConfig, loadDefaults, writeDefaults
      } = require('../lib/config'),
      { question } = require('../lib/questionnaires'),
      { stringToBoolean, rVal, rString } = require('@medable/mdctl-core-utils/values'),
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
        }
      }

class Configure extends Task {

  constructor(){
    super({
      clean: {
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
          keys = Object.keys(configureOptions),
          local = {},
          localCfg = createConfig() // attempt to re-read the config from the configure file.

    if (isClean) {
      return clearDefaults()
    }

    try {
      localCfg.update(await loadDefaults())
    } catch (err) {
      // eslint-disable-line no-empty
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
    `
  }

}

module.exports = Configure
