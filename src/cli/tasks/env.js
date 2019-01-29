/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      fs = require('fs'),
      ndjson = require('ndjson'),
      { Readable } = require('stream'),
      { isSet } = require('../../lib/utils/values'),
      pathTo = require('../../lib/utils/path.to'),
      Task = require('../lib/task'),
      { CredentialsManager } = require('../../lib/api/credentials'),
      Client = require('../../lib/api/client'),
      Stream = require('../../lib/stream'),
      FileAdapter = require('../../lib/stream/adapters/file_adapter')

class Env extends Task {

  constructor(credentialsManager = CredentialsManager, ApiClient = Client) {
    super()
    this.credentialsManager = credentialsManager
    this.ApiClient = ApiClient
    this.optionKeys = ['endpoint', 'env', 'manifest', 'format']
  }

  async run(cli) {

    const arg1 = cli.args('1'),
          handler = `env@${arg1}`

    if (!isSet(arg1)) {
      return console.log(Env.help(cli))
    }

    if (!_.isFunction(this[handler])) {
      throw new Error('Invalid command')
    }
    return this[handler](cli)
  }

  async 'env@export'(cli) {
    const passedOptions = cli.getArguments(this.optionKeys),
          manifest = JSON.parse(fs.readFileSync(passedOptions.manifest || `${cli.cwd}/manifest.json`)),
          stream = ndjson.parse(),
          client = await cli.getApiClient(),
          url = new URL('/developer/environment/export', client.environment.url),
          options = {
            query: url.searchParams,
            method: 'post'
          }

    this.writeExport(stream, passedOptions)
    pathTo(options, 'requestOptions.headers.accept', 'application/x-ndjson')
    const resultStream = await client.call(url.pathname, Object.assign(options, { stream }))
    return new Promise((resolve) => {
      resultStream.on('data', (r) => {
        console.log(r)
      })
      resultStream.on('end', (r) => {
        resolve()
      })
    })
  }

  async 'env@import'() {

    console.log('mdctl env import')
  }

  // ----------------------------------------------------------------------------------------------

  static get synopsis() {
    return 'environment tools'
  }

  static help() {

    return `    
      Environment environment tools.
      
      Usage: 
        
        mdctl env [command] [options]
            
      Arguments:               
        
        command                      
          export - export from an endpoint environment        
          import - import to an endpoint environment        
                  
        options     
          --endpoint sets the endpoint. eg. api.dev.medable.com     
          --env sets the environment. eg. example                              
          --manifest - defaults to $cwd/manifest.json
          --format - export format (json, yaml) defaults to json                        
    `
  }

  getPasswordSecret(passedOptions) {
    const search = _.pick(passedOptions, 'endpoint', 'env')
    return this.credentialsManager.get(search)
  }

  writeExport(stream, passedOptions) {
    const format = passedOptions.format && { format: passedOptions.format }
    stream.pipe(new Stream())
      .pipe(new FileAdapter(`${process.cwd()}/output-${new Date().getTime()}`, format))
      .on('data', (d) => {
        console.log(d)
      })
      .on('finish', () => {
        console.log('All Good!')
      })
      .on('error', (err) => {
        console.log(err)
      })
  }

}

module.exports = Env
