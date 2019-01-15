/* eslint-disable class-methods-use-this */
/* eslint-disable no-await-in-loop */

const path = require('path'),
      fs = require('fs'),
      jsyaml = require('js-yaml'),
      Task = require('../lib/task'),
      { createConfig } = require('../lib/config'),
      { loadJsonOrYaml, question, yn } = require('../../utils'),
      { isSet } = require('../../utils/values')

class Configure extends Task {

  async run(cli) {

    const isClean = cli.args('clean'),
          configureDir = path.join(process.env.HOME, '.medable'),
          configureFile = path.join(configureDir, 'mdctl.yaml'),
          keys = 'defaultEnv defaultEndpoint'.split(' '),
          local = {},
          localCfg = createConfig() // attempt to re-read the config from the configure file.

    if (isClean) {
      try {
        fs.unlinkSync(configureFile)
      } catch (err) {
        // eslint-disable-line no-empty
      }
      return true
    }

    try {
      localCfg.update(await loadJsonOrYaml(configureFile))
    } catch (err) {
      // eslint-disable-line no-empty
    }

    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i]
      let current = localCfg(key) || cli.config(key)
      current = isSet(current) ? current : ''
      local[key] = await question(key, current)
    }

    {
      const file = `# ------------------------------------------------\n${jsyaml.safeDump(local)}# ------------------------------------------------\n`

      if (!cli.args('quiet') && !await yn(`\n${file}is this correct?`)) {
        return false
      }

      this.assert(
        `Writing new config to ${configureFile}...`,
        'Writing config failed',
        `mkdir -p ${configureDir}`,
        () => {
          fs.writeFileSync(configureFile, file, 'utf8')
          return true
        }
      )
    }

    return true

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
