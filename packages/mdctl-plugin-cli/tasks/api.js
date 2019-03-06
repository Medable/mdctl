/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      { URL } = require('url'),
      jsyaml = require('js-yaml'),
      ndjson = require('ndjson'),
      fs = require('fs'),
      { rString, isSet } = require('@medable/mdctl-core-utils/values'),
      { loadJsonOrYaml, pathTo, searchParamsToObject } = require('@medable/mdctl-core-utils'),
      { Fault } = require('@medable/mdctl-core'),
      Task = require('../lib/task'),
      methods = ['get', 'post', 'put', 'patch', 'delete']

let Undefined

class Api extends Task {

  async run(cli) {

    const method = rString(cli.args('1'), 'get').toLowerCase(),
          client = await cli.getApiClient({ credentials: await cli.getAuthOptions() }),
          url = new URL(rString(cli.args('2'), '/'), client.environment.url),
          options = {
            query: searchParamsToObject(url.searchParams)
          },
          format = cli.args('format')

    if (!methods.includes(method)) {
      throw new TypeError(`Invalid request method. Expected: ${methods}`)
    }

    if (rString(cli.args('file'))) {
      const file = await loadJsonOrYaml(cli.args('file'))
      Object.assign(options, _.pick(file, 'body', 'query', 'requestOptions', 'grep'))
    }

    if (rString(cli.args('stream'))) {
      options.body = fs.createReadStream(cli.args('stream'))
    }

    Api.mergeJsonArgIf(cli, options, 'body')
    Api.mergeJsonArgIf(cli, options, 'query')
    Api.mergeJsonArgIf(cli, options, 'requestOptions')
    Api.applyArgIf(cli, options, 'grep')

    let err,
        result,
        output,
        { grep } = options

    delete options.grep
    if (_.isString(grep) && grep.length) {
      const match = grep.match(/^\/(.*)\/(.*)/)
      if (match && match[0].length) {
        try {
          grep = new RegExp(match[1], match[2])
        } catch (e) {
          throw Fault.create('kInvalidArgument', { reason: 'Invalid validator regex pattern' })
        }
      } else {
        grep = new RegExp(String(grep).replace(/[\\^$*+?.()|[\]{}]/g, '\\$&'))
      }
    }

    options.method = method

    function outputResult(data) {
      const formatted = Api.formatOutput(data, format),
            isError = data && data.object === 'fault'

      if (isError) {
        console.error(formatted)
      } else if (!grep || grep.test(formatted)) {
        console.log(formatted)
      }

    }

    if (cli.args('ndjson')) {

      pathTo(options, 'requestOptions.headers.accept', 'application/x-ndjson')
      options.stream = ndjson.parse()

      const stream = await client.call(url.pathname, options)

      return new Promise((resolve) => {

        stream.on('data', (data) => {
          if (pathTo(data, 'object') === 'fault') {
            outputResult(Fault.from(data).toJSON())
          } else if (pathTo(data, 'object') === 'result') {
            outputResult(data.data)
          } else {
            outputResult(data)
          }
        })

        stream.on('error', (error) => {
          outputResult(Fault.from(error).toJSON())
          resolve(true)
        })

        stream.on('end', () => {
          resolve(true)
        })

      })

    }

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
      outputResult(output)
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

  static applyArgIf(cli, options, arg) {

    const value = cli.args(arg)
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
        --file - reads body, query, grep and requestOptions from a json/yaml file.                       
        --stream - streams a local file directly to the request.                          
        --format - output format. defaults to pretty (json, pretty, yaml, raw)
        --grep - grep text in an ndjson stream and output matching objects
        --verbose - outputs an object with request and response information                
                                                                                
    `
  }

}

module.exports = Api
