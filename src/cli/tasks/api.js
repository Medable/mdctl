/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      { URL } = require('url'),
      jsyaml = require('js-yaml'),
      ndjson = require('ndjson'),
      { rString } = require('../../lib/utils/values'),
      { loadJsonOrYaml } = require('../../lib/utils'),
      Fault = require('../../lib/fault'),
      pathTo = require('../../lib/utils/path.to'),
      Task = require('../lib/task'),
      methods = ['get', 'post', 'put', 'patch', 'delete']

let Undefined

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

    options.method = method

    if (cli.args('ndjson')) {

      pathTo(options, 'requestOptions.headers.accept', 'application/x-ndjson')
      options.stream = ndjson.parse()

      const stream = await client.call(url.pathname, options),
            format = cli.args('format')

      return new Promise((resolve) => {

        stream.on('data', (data) => {
          if (pathTo(data, 'object') === 'fault') {
            console.error(Api.formatOutput(Fault.from(data).toJSON(), format))
          } else if (pathTo(data, 'object') === 'result') {
            console.log(Api.formatOutput(data.data, format))
          } else {
            console.log(Api.formatOutput(data, format))
          }
        })

        stream.on('error', (error) => {
          console.error(Api.formatOutput(Fault.from(error).toJSON(), format))
          resolve(true)
        })

        stream.on('end', () => {
          resolve(true)
        })

      })

    }

    let err,
        result,
        output

    try {
      result = await client.call(url.pathname, options)
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

    if (output !== Undefined) {
      console.log(Api.formatOutput(output, cli.args('format')))
    }

    return true

  }

  static mergeJsonArgIf(cli, options, arg) {

    const value = cli.args(arg)
    if (rString(value)) {
      const parsed = JSON.parse(value)
      options[arg] = _.merge(options[arg], parsed) // eslint-disable-line no-param-reassign
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
        --ndjson -- sends the "accept: application/x-ndjson" header and outputs as the stream is received
        --query - query arguments json. merges with path query arguments                                   
        --requestOptions - custom request options json                    
        --file - reads body, query and requestOptions from a json/yaml file.                                                   
        --format - output format. defaults to pretty (json, pretty, yaml, raw)
        --verbose - outputs an object with request and response information                
                                                                                
    `
  }

}

module.exports = Api
