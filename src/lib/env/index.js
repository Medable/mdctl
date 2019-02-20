const fs = require('fs'),
      pump = require('pump'),
      ndjson = require('ndjson'),
      { URL } = require('url'),
      {
        isSet, parseString, pathTo, rFunction
      } = require('../utils/values'),
      { templates } = require('../../lib/schemas'),
      { Manifest } = require('../../lib/manifest'),
      { Config } = require('../config'),
      { ExportStream, ImportStream } = require('../../lib/stream'),
      { ExportFileAdapter } = require('../../lib/stream/adapters/file_adapter')

module.exports = {

  async export(input) {

    const options = isSet(input) ? input : {},
          client = options.client || Config.global.client,
          outputDir = options.dir || process.cwd(),
          manifestFile = options.manifest || `${outputDir}/manifest.${options.format || 'json'}`,
          // stream = ndjson.parse(),
          url = new URL('/developer/environment/export', client.environment.url),
          requestOptions = {
            query: url.searchParams,
            method: 'post',
            preferUrls: false
          },
          streamOptions = {
            format: options.format
          },
          streamTransform = new ExportStream(),
          adapter = options.adapter || new ExportFileAdapter(outputDir, streamOptions)

    let inputStream = ndjson.parse()
    if (!options.stream) {

      let manifest = {}
      if (fs.existsSync(manifestFile)) {
        manifest = parseString(fs.readFileSync(manifestFile), options.format)
      }

      pathTo(requestOptions, 'requestOptions.headers.accept', 'application/x-ndjson')
      await client.call(url.pathname, Object.assign(requestOptions, {
        stream: inputStream, body: { manifest }
      }))
    } else {
      inputStream = options.stream.pipe(ndjson.parse())
    }

    return new Promise((resolve, reject) => {
      const resultStream = pump(inputStream, streamTransform, adapter, (error) => {
        if (error) {
          return reject(error)
        }
        return resolve(resultStream)
      })
    })

  },

  async import(input) {

    const options = isSet(input) ? input : {},
          client = options.client || Config.global.client,
          inputDir = options.dir || process.cwd(),
          progress = rFunction(options.progress),
          url = new URL('/developer/environment/import', client.environment.url),
          requestOptions = {
            query: url.searchParams,
            method: 'post',
            preferUrls: false
          },
          importStream = new ImportStream(inputDir, options.format),
          ndjsonStream = ndjson.stringify(),
          streamChain = pump(importStream, ndjsonStream)

    if (!options.stream) {
      pathTo(options, 'requestOptions.headers.accept', 'application/x-ndjson')
      await client.call(url.pathname, Object.assign(requestOptions, {
        body: streamChain
      }))
    }

    return new Promise((resolve, reject) => {
      streamChain.on('data', (d) => {
        progress(d)
      })
      streamChain.on('error', (e) => {
        reject(e)
      })
      streamChain.on('end', () => {
        resolve()
      })
    })

  },

  async add(input) {
    const options = isSet(input) ? input : {},
          template = await templates.create(options.object, options.type, options.name),
          outputDir = options.dir || process.cwd,
          manifestFile = options.manifest || `${outputDir}/manifest.${options.format || 'json'}`

    let manifest = {}
    if (fs.existsSync(manifestFile)) {
      manifest = parseString(fs.readFileSync(manifestFile), options.format || 'json')
    }

    await new Manifest(manifest).addResource(template.object, template.exportKey, template, options)

  }
}
