/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      fs = require('fs'),
      { Readable } = require('stream'),
      { isSet } = require('../../lib/utils/values'),
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
    const passedOptions = _.reduce(this.optionKeys,
            (sum, key) => _.extend(sum, { [key]: cli.args(key) }), {}),
          defaultCredentials = cli.config('defaultCredentials'),
          passwordSecretQuery = _.isUndefined(passedOptions.endpoint)
            && _.isUndefined(passedOptions.env) ? defaultCredentials : passedOptions,
          passwordSecret = await this.getPasswordSecret(passwordSecretQuery),
          manifest = JSON.parse(fs.readFileSync(passedOptions.manifest || `${cli.cwd}/manifest.json`))

    return (await cli.getApiClient({ passwordSecret })).post('/routes/stubbed_export', manifest)
      .then(exportResponse => this.writeExport(passedOptions, JSON.stringify(exportResponse)))
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

  writeExport(passedOptions, stringifiedContent) {
    const format = passedOptions.format && { format: passedOptions.format }
    return new Promise((resolve, reject) => {
      const readBlob = new Readable()
      // eslint-disable-next-line no-underscore-dangle
      readBlob._read = () => {}

      readBlob
        .pipe(new Stream())
        .pipe(new FileAdapter(`output-${new Date().getTime()}`, format))
        .on('finish', () => {
          resolve()
        })
        .on('error', (err) => {
          reject(err)
        })

      readBlob.push(Buffer.from(stringifiedContent))

    })
  }

}

module.exports = Env
