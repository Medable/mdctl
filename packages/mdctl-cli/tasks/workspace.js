/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      { Fault } = require('@medable/mdctl-core'),
      { isSet } = require('@medable/mdctl-core-utils/values'),
      Table = require('cli-table'),
      LockUnlock = require('../lib/lock_unlock'),
      { askWorkspaceLock } = require('../lib/questionnaires'),
      Task = require('../lib/task')

class Workspace extends Task {

  constructor() {
    super()
    this.optionKeys = ['dir', 'endpoint', 'env', 'actions']
  }

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


  static get taskNames() {
    return ['workspace', 'ws']
  }

  async 'workspace@locks'(cli) {
    // eslint-disable-next-line max-len
    const params = Object.assign(await cli.getAuthOptions() || {}, { action: this.args('2'), dir: process.cwd() }, cli.getArguments(this.optionKeys)),
          // eslint-disable-next-line max-len
          result = await askWorkspaceLock(params),
          client = await cli.getApiClient(),
          { endpoint: defaultEndpoint, env: defaultEnv } = client.credentials.environment,
          options = Object.assign({ endpoint: defaultEndpoint, env: defaultEnv }, result),
          {
            dir, endpoint, env, actions
          } = options,
          lockUnlock = new LockUnlock(dir, endpoint, env, actions)

    let response = ''
    switch (options.action) {
      case 'add':
        await lockUnlock.addLock()
        break
      case 'remove':
        await lockUnlock.removeLock()
        break
      case 'list':
        // eslint-disable-next-line no-case-declarations
        const locks = lockUnlock.getCurrentLocks(),
              table = new Table({
                head: ['Endpoint', 'Env (Org Code)', 'Lock For', 'Url'],
                colWidths: [20, 20, 20, 50]
              })

        // eslint-disable-next-line max-len
        table.push(...locks.map(lock => [lock.endpoint, lock.env, lock.actions, lockUnlock.formatEndpoint(lock.endpoint)]))
        response = table.toString()
        break
      case 'clear':
        await lockUnlock.clearLocks()
        break
      default:
        throw Fault.create('kNoAction', {
          reason: 'No action defined for locks'
        })
    }
    return console.log(response)
  }

  // ----------------------------------------------------------------------------------------------

  static get synopsis() {
    return 'workspace tools'
  }

  static help() {

    return `    
      Workspace environment tools.
      
      Usage: 
        
        mdctl workspace [command] [add|remove|clear] [options]
            
      Arguments:               
        
        command                      
          locks - will show the options if empty action 
            
        options     
          --endpoint sets the endpoint. eg. api.dev.medable.com     
          --env sets the environment. eg. medable, it could also be [*] this will enable any environment.  
          --dir if you want to lock/unlock a different location workspace                                                 
    `
  }

}

module.exports = Workspace
