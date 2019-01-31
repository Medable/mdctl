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
      FileAdapter = require('../../lib/stream/adapters/file_adapter')

class Env extends Task {

  constructor() {
    super()
    this.optionKeys = ['endpoint', 'env', 'manifest', 'format', 'layout', 'dir']
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
    const passedOptions = await cli.getArguments(this.optionKeys),
          outputDir = passedOptions.dir || cli.cwd,
          manifestFile = passedOptions.manifest || `${outputDir}/manifest.${passedOptions.format || 'json'}`,
          stream = ndjson.parse(),
          passwordSecret = await CredentialsManager.get(passedOptions),
          client = await cli.getApiClient({ passwordSecret }),
          url = new URL('/developer/environment/export', client.environment.url),
          options = {
            query: url.searchParams,
            method: 'post'
          },
          streamOptions = passedOptions.format && {
            format: passedOptions.format,
            layout: passedOptions.layout
          },
          streamTransform = new Stream(streamOptions),
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
          console.log(error)
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

}

module.exports = Env
