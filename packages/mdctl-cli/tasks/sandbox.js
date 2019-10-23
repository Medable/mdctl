/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      jsyaml = require('js-yaml'),
      fs = require('fs'),
      { rString, isSet, stringToBoolean } = require('@medable/mdctl-core-utils/values'),
      { loadJsonOrYaml } = require('@medable/mdctl-node-utils'),
      sandbox = require('@medable/mdctl-sandbox'),
      Task = require('../lib/task')


class Sandbox extends Task {

  static get taskNames() {

    return ['sandbox', 'sb']

  }

  async run(cli) {

    const options = {
            client: await cli.getApiClient({ credentials: await cli.getAuthOptions() }),
            stats: true
          },
          format = this.args('format'),
          response = {}

    if (rString(this.args('file'))) {
      const file = await loadJsonOrYaml(this.args('file'))
      Object.assign(options, _.pick(file, 'body', 'arguments', 'strictSSL', 'optimize'))
    }

    options.script = fs.readFileSync(this.args('1'), 'utf8')

    this.mergeJsonArgIf(options, 'body')
    this.mergeJsonArgIf(options, 'arguments')
    this.applyArgIf(options, 'strictSSL')
    this.applyArgIf(options, 'optimize')

    if (isSet(options.strictSSL)) {
      options.client.setRequestOption('strictSSL', stringToBoolean(options.strictSSL))
    }

    try {
      Object.assign(response, await sandbox.run(options))
    } catch (e) {
      response.err = e.toJSON()
    }

    if (this.args('verbose')) {
      console.log(Sandbox.formatOutput(response, format))
    } else if (response.err) {
      console.error(Sandbox.formatOutput(response.err, format))
    } else {
      console.log(Sandbox.formatOutput(response.result, format))
    }

    return true

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

  // ----------------------------------------------------------------------------------------------

  static get synopsis() {
    return 'script sandbox executor'
  }

  static help() {

    return `    
    Sandbox Executor
    
    Usage: 
      
      mdctl sandbox|sb [script] --file --format --body --arguments --strictSSL --optimize       
          
    Arguments:               
      
      Command 
                                     
        script - script file to run                               
                
      Options 
        
        --optimize - run through script optimizer to test pre-compiled bytecode    
        --body - request.body
        --arguments - script.arguments                                                                                                      
        --file - reads body, arguments, optimize and strictSSL from a json/yaml file.                                                         
        --format - output format. defaults to pretty (json, pretty, yaml, raw)
        --strictSSL        
        --verbose - outputs an object with request and response information                                                                                                
    `
  }

}

module.exports = Sandbox
