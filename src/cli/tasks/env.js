/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      fs = require('fs'),
      { URL } = require('url'),
      pump = require('pump'),
      ndjson = require('ndjson'),
      { isSet } = require('../../lib/utils/values'),
      pathTo = require('../../lib/utils/path.to'),
      Task = require('../lib/task'),
      { CredentialsManager } = require('../../lib/api/credentials'),
      Stream = require('../../lib/stream'),
      { templates } = require('../../lib/schemas'),
      FileAdapter = require('../../lib/stream/adapters/file_adapter')

class Env extends Task {

  constructor() {
    super()
    this.optionKeys = ['manifest', 'format', 'layout', 'dir']
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
    const envOptions = await cli.getArguments(['endpoint', 'env']),
          exportOptions = await cli.getArguments(this.optionKeys),
          outputDir = exportOptions.dir || cli.cwd,
          manifestFile = exportOptions.manifest || `${outputDir}/manifest.${exportOptions.format || 'json'}`,
          stream = ndjson.parse(),
          // this is wrong because it will ignore a login.
          passwordSecret = !_.isEmpty(envOptions) && await CredentialsManager.get(envOptions),
          client = await cli.getApiClient({ passwordSecret }),
          url = new URL('/developer/environment/export', client.environment.url),
          options = {
            query: url.searchParams,
            method: 'post'
          },
          streamOptions = exportOptions.format && {
            format: exportOptions.format,
            layout: exportOptions.layout,
            config: cli.config
          },
          streamTransform = new Stream(),
          fileWriter = new FileAdapter(outputDir, streamOptions)

    let manifest = {}
    if (fs.existsSync(manifestFile)) {
      manifest = JSON.parse(fs.readFileSync(manifestFile))
    }

    pathTo(options, 'requestOptions.headers.accept', 'application/x-ndjson')
    await client.call(url.pathname, Object.assign(options, {
      stream, body: { manifest }
    }))

    return new Promise((resolve, reject) => {
      pump(stream, streamTransform, fileWriter, (error) => {
        if (error) {
          return reject(error)
        }
        console.log('Export finished...')
        return resolve()
      })
    })
  }

  async 'env@import'() {

    console.log('mdctl env import')
  }

  async 'env@add'(cli) {
    const template = await templates.create(cli.args('2'), cli.args('3'), cli.args('4')),
          params = await cli.getArguments(this.optionKeys),
          fileAdapter = new FileAdapter(null, params)
    await fileAdapter.addResource(cli.args('2'), template)
    console.log('Resource added.')
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
          add object [type] name - add a new resource      
                  
        options     
          --endpoint sets the endpoint. eg. api.dev.medable.com     
          --env sets the environment. eg. example                              
          --manifest - defaults to $cwd/manifest.json
          --format - export format (json, yaml) defaults to json                        
    `
  }

}

module.exports = Env
