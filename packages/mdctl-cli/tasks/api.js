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

  constructor() {
    super({
      format: {
        default: 'json',
        type: 'string'
      },
      file: {
        type: 'string',
        default: ''
      },
      body: {
        type: 'string',
        default: ''
      },
      query: {
        type: 'string',
        default: ''
      },
      grep: {
        type: 'boolean',
        default: false
      },
      strictSSL: {
        type: 'boolean',
        default: true
      },
      preferUrls: {
        type: 'boolean',
        default: false
      },
      ndjson: {
        type: 'boolean',
        default: false
      },
      silent: {
        type: 'boolean',
        default: true
      }
    })

  }

  async run(cli) {

    const method = rString(this.args('1'), 'get').toLowerCase(),
          client = await cli.getApiClient({ credentials: await cli.getAuthOptions() }),
          url = new URL(rString(this.args('2'), '/'), client.environment.url),
          options = {
            query: searchParamsToObject(url.searchParams)
          },
          format = this.args('format')

    if (!methods.includes(method)) {
      throw new TypeError(`Invalid request method. Expected: ${methods}`)
    }

    if (rString(this.args('file'))) {
      const file = await loadJsonOrYaml(this.args('file'))
      Object.assign(options, _.pick(file, 'body', 'query', 'requestOptions', 'grep'))
    }

    if (rString(this.args('stream'))) {
      options.body = fs.createReadStream(this.args('stream'))
    }

    this.mergeJsonArgIf(options, 'body')
    this.mergeJsonArgIf(options, 'query')
    this.mergeJsonArgIf(options, 'requestOptions')
    this.applyArgIf(options, 'grep')

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

    if (this.args('ndjson')) {

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

    if (this.args('verbose')) {
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
