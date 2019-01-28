const _ = require('lodash'),
      { isSet } = require('../../lib/utils/values'),
      Task = require('../lib/task'),
      LocalResources = require('../../lib/resources/local_resources')


class Resources extends Task {

  constructor() {
    super()
    this.optionKeys = ['folder', 'name', 'type', 'format']
    this.localResources = new LocalResources()
  }

  async run(cli) {

    const arg2 = cli.args('2'),
          handler = `resources@${arg2}`

    if (!isSet(arg2)) {
      return console.log(Resources.help(cli))
    }
    if (!_.isFunction(this[handler])) {
      throw new Error('Invalid command')
    }


    return this[handler](cli, arg2)

  }

  async 'resources@script'(cli, type) {
    const args = await cli.getArguments(this.optionKeys)
    this.localResources.create(type, args)
    console.log('adding a new script')
  }

  async 'resources@template'(cli, type) {
    console.log('adding a new template')
  }

  async 'resources@object'(cli, type) {
    console.log('adding a new object')
  }

  async 'resources@view'(cli, type) {
    console.log('adding a new view')
  }

  static help() {
    return `
      Environment environment tools.
      
      Usage: 
        
        mdctl env add [command] [options]
            
      Arguments:               
        
        command                      
          script - will create a new script into the environment        
          template - will create a new template into the environment
          view - will create a new view into the environment 
          object - will create a new object into the environment
          --folder - set the folder where the environment data is
          --name - set the name of the resource
          --type - set the type for a script route, job, library, trigger, default route
          --format - set the format output json/yaml default json
    `
  }

}

module.exports = Resources
