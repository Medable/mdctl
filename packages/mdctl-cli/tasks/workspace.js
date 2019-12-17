/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      { isSet } = require('@medable/mdctl-core-utils/values'),
      lockUnlock = require('../lib/lock_unlock'),
      Task = require('../lib/task')

class Workspace extends Task {

  async run(cli) {

    const arg1 = this.args('1'),
          handler = `workspace@${arg1}`

    if (!isSet(arg1)) {
      return console.log(Workspace.help(cli))
    }

    if (!_.isFunction(this[handler])) {
      throw new Error('Invalid command')
    }
    return this[handler](cli)
  }

  async 'workspace@lock'(cli) {
    // eslint-disable-next-line max-len
    const params = Object.assign(await cli.getAuthOptions() || {}, await cli.getArguments(this.optionKeys)),
          client = await cli.getApiClient(),
          { endpoint: defaultEndpoint, env: defaultEnv } = client.credentials.environment,
          // eslint-disable-next-line max-len
          { endpoint, env, dir } = Object.assign({ endpoint: defaultEndpoint, env: defaultEnv }, params)
    await lockUnlock.lock(dir || process.cwd(), endpoint, env)
  }

  async 'workspace@unlock'(cli) {
    const params = await cli.getArguments(this.optionKeys),
          { dir } = params
    await lockUnlock.unlock(dir || process.cwd())
  }

  // ----------------------------------------------------------------------------------------------

  static get synopsis() {
    return 'workspace tools'
  }

  static help() {

    return `    
      Workspace environment tools.
      
      Usage: 
        
        mdctl workspace [command] [options]
            
      Arguments:               
        
        command                      
          lock - will lock workspace to an specific endpoint/env location
          unlock - will remove lock for an specific endpoint/env location    
                  
        options     
          --endpoint sets the endpoint. eg. api.dev.medable.com     
          --env sets the environment. eg. medable, it could also be [*] this will enable any environment.  
          --dir if you want to lock/unlock a different location workspace                                                 
    `
  }

}

module.exports = Workspace
