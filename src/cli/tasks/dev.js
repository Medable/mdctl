/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      fs = require('fs'),
      { isSet } = require('../../lib/utils/values'),
      Task = require('../lib/task'),
      { CredentialsManager } = require('../../lib/api/credentials'),
      Client = require('../../lib/api/client'),
      Stream = require('../../../src/lib/stream'),
      FileAdapter = require('../../../src/lib/stream/adapters/file_adapter')

class Dev extends Task {

  constructor(credentialsManager = CredentialsManager, ApiClient = Client) {
    super()
    this.credentialsManager = credentialsManager
    this.ApiClient = ApiClient
    this.optionKeys = ['endpoint', 'env', 'quite', 'manifest', 'sparse', 'format']
  }

  async run(cli) {

    const arg2 = cli.args('2'),
          handler = `${cli.args('1')}@${arg2}`

    if (!isSet(arg2)) {
      return console.log(Dev.help(cli))
    }

    if (!_.isFunction(this[handler])) {
      throw new Error('Invalid command')
    }
    return this[handler](cli)
  }

  async 'env@export'(cli) {
    const passedOptions = _.reduce(this.optionKeys,
            (sum, key) => _.extend(sum, { [key]: cli.config(key) }), {}),
          defaultCredentials = cli.config('defaultCredentials'),
          // get credentials based on arguments or load defaults
          credentials = await this.getCredentials(passedOptions)
            || await this.getCredentials(defaultCredentials),
          environment = _.isUndefined(passedOptions.endpoint) ? defaultCredentials : passedOptions,
          apiClient = new this.ApiClient({ environment, credentials }),
          manifest = JSON.parse(fs.readFileSync(passedOptions.manifest || `${__dirname}/manifest.json`))

    return apiClient.post('/accounts/login')
      .then(() => apiClient.post('/developer/export', manifest))
      .then(exportResponse => this.writeExport(passedOptions, JSON.stringify(exportResponse.body)))
  }

  async 'env@import'() {

    console.log('mdctl dev env import')
  }

  // ----------------------------------------------------------------------------------------------

  static get synopsis() {
    return 'developer tools'
  }

  static help(cli) {

    const command = cli.args('2') || cli.args('1')

    switch (command) {
      case 'env': return this.envHelp()
      default:
    }

    return `    
    Developer tools.
    
    Usage: 
      
      mdctl dev [command] [options]
          
    Arguments:               
      
      command                
        env - environment tools         
                
      options                           
        --quiet - suppress confirmations                        
    `
  }

  static envHelp() {

    return `    
    Developer environment tools.
    
    Usage: 
      
      mdctl dev env [command] [options]
          
    Arguments:               
      
      command                      
        export - export from an endpoint environment        
        import - import to an endpoint environment        
                
      options     
        --endpoint sets the endpoint. eg. api.dev.medable.com     
        --env sets the environment. eg. example                              
        --quiet - suppress confirmations
        --manifest - defaults to $cwd/manifest.json
        --sparse - sparse manifest?
        --format - export format (json, yaml) defaults to json                        
    `

  }

  getCredentials(passedOptions) {
    const search = _.pick(passedOptions, 'endpoint', 'env')
    return this.credentialsManager.get(search)
  }

  writeExport(passedOptions, stringifiedContent) {
    return new Promise((resolve, reject) => {
      fs.createReadStream(stringifiedContent)
        .pipe(new Stream())
        .pipe(new FileAdapter(null, { format: passedOptions.format }))
        .on('finish', () => {
          resolve() // need to check error handling in this bit
        })
    })
  }

}

module.exports = Dev
