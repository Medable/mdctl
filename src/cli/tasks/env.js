/* eslint-disable class-methods-use-this */

const _ = require('lodash'),
      fs = require('fs'),
      { URL } = require('url'),
      pump = require('pump'),
      ndjson = require('ndjson'),
      { isSet, parseString } = require('../../lib/utils/values'),
      pathTo = require('../../lib/utils/path.to'),
      Task = require('../lib/task'),
      { CredentialsManager } = require('../../lib/api/credentials'),
      { ExportStream, ImportStream } = require('../../lib/stream'),
      { templates } = require('../../lib/schemas'),
      { ExportFileAdapter } = require('../../lib/stream/adapters/file_adapter'),
      { Manifest } = require('../../lib/manifest')

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
          streamTransform = new ExportStream(),
          fileWriter = new ExportFileAdapter(outputDir, streamOptions)

    let manifest = {}
    if (fs.existsSync(manifestFile)) {
      manifest = parseString(fs.readFileSync(manifestFile), exportOptions.format)
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

  async 'env@import'(cli) {
    const envOptions = await cli.getArguments(['endpoint', 'env']),
          importOptions = await cli.getArguments(this.optionKeys),
          inputDir = importOptions.dir || cli.cwd,
          // manifestFile = importOptions.manifest || `${inputDir}/manifest.${importOptions.format || 'json'}`,
          // this is wrong because it will ignore a login.
          // let manifest = {}
          // if (fs.existsSync(manifestFile)) {
          //  manifest = parseString(fs.readFileSync(manifestFile), importOptions.format)
          // }
          passwordSecret = !_.isEmpty(envOptions) && await CredentialsManager.get(envOptions),
          client = await cli.getApiClient({ passwordSecret }),
          url = new URL('/developer/environment/import', client.environment.url),
          options = {
            query: url.searchParams,
            method: 'post'
          },
          importStream = new ImportStream(inputDir),
          ndjsonStream = ndjson.stringify(),
          stream = pump(importStream, ndjsonStream)

    pathTo(options, 'requestOptions.headers.accept', 'application/x-ndjson')
    await client.call(url.pathname, Object.assign(options, {
      body: stream
    }))
    stream.on('data', (d) => {
      console.log('Sending chunk...', d)
    })
    stream.on('end', () => {
      console.log('ending...')
    })
  }

  async 'env@add'(cli) {
    const template = await templates.create(cli.args('2'), cli.args('3'), cli.args('4')),
          params = await cli.getArguments(this.optionKeys),
          outputDir = params.dir || cli.cwd,
          manifestFile = params.manifest || `${outputDir}/manifest.${params.format || 'json'}`

    let manifest = {}
    if (fs.existsSync(manifestFile)) {
      manifest = parseString(fs.readFileSync(manifestFile), params.format || 'json')
    }

    await new Manifest(manifest).addResource(template.object, template.exportKey, template, params)
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
