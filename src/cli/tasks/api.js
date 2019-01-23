/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      { rString, isSet } = require('../../lib/utils/values'),
      { loadJsonOrYaml } = require('../../lib/utils'),
      Task = require('../lib/task'),
      { URL } = require('url'),
      jsyaml = require('js-yaml'),
      methods = ['get', 'post', 'put', 'patch', 'delete']

class Api extends Task {

  async run(cli) {

    const method = rString(cli.args('1'), 'get').toLowerCase(),
          client = await cli.getApiClient(),
          url = new URL(rString(cli.args('2'), '/'), client.environment.url),
          options = {
            query: url.searchParams
          }

    if (!methods.includes(method)) {
      throw new TypeError(`Invalid request method. Expected: ${methods}`)
    }

    if (rString(cli.args('file'))) {
      const file = await loadJsonOrYaml(cli.args('file'))
      Object.assign(options, _.pick(file, 'body', 'query', 'requestOptions'))
    }

    Api.mergeJsonArgIf(cli, options, 'body')
    Api.mergeJsonArgIf(cli, options, 'query')
    Api.mergeJsonArgIf(cli, options, 'requestOptions')

    let err,
        result,
        output
    try {
      result = await client[method](url.pathname, options)
    } catch (e) {
      err = e
    }

    if (err) {
      output = err.toJSON()
    } else {
      output = result
    }

    if (cli.args('verbose')) {

      output = {
        response: client.response.toJSON(),
        result: output
      }

    }

    console.log(Api.formatOutput(output, cli.args('format')))

  }

  static mergeJsonArgIf(cli, options, arg) {

    const value = cli.args(arg)
    if (rString(value)) {
      const parsed = JSON.parse(value)
      options[arg] = _.merge(options[arg], parsed)
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
    return 'developer api harness'
  }

  static help() {

    return `    
    Developer API Harness.
    
    Usage: 
      
      mdctl api [method] [path] --file --format --body --query --requestOptions       
          
    Arguments:               
      
      Command 
                                     
        method - get, post, put, patch, delete  
        path - api path        
                
      Options 
        
        --body - payload
        --query - query arguments json. merges with path query arguments                                   
        --requestOptions - custom request options json                    
        --file - reads body, query and requestOptions from a json/yaml file.                                                   
        --format - output format. defaults to pretty (json, pretty, yaml, raw)
        --verbose - outputs an object with request and response information.              
                                                                                
    `
  }

}

module.exports = Api
