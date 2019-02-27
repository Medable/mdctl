const fs = require('fs'),
      pump = require('pump'),
      ndjson = require('ndjson'),
      zlib = require('zlib'),
      { URL } = require('url'),
      {
        isSet, parseString, pathTo, rFunction, rBool
      } = require('../utils/values'),
      {
        searchParamsToObject
      } = require('../utils'),
      { templates } = require('../../lib/schemas'),
      { Manifest } = require('../../lib/manifest'),
      { Config } = require('../config'),
      { ExportStream, ImportStream } = require('../../lib/stream'),
      { ExportFileTreeAdapter } = require('../../lib/stream/adapters/file_adapter'),
      Client = require('../../lib/api/client')

module.exports = {

  /**
   *
   * @param input
   *  format: defaults to json. 'yaml|json'
   *  manifest
   *  client
   *  dir
   *  adapter
   *  stream
   *  silent
   *
   * @returns {Promise<*>}
   */
  async export(input) {

    const options = isSet(input) ? input : {},
          client = options.client || new Client({ ...Config.global.client, ...options }),
          outputDir = options.dir || process.cwd(),
          manifestFile = options.manifest || `${outputDir}/manifest.${options.format || 'json'}`,
          // stream = ndjson.parse(),
          url = new URL('/developer/environment/export', client.environment.url),
          requestOptions = {
            query: {
              ...searchParamsToObject(url.searchParams),
              preferUrls: rBool(options.preferUrls, false),
              silent: rBool(options.silent, false)
            },
            method: 'post'
          },
          streamOptions = {
            format: options.format,
            clearOutput: options.clear
          },
          streamTransform = new ExportStream(),
          adapter = options.adapter || new ExportFileTreeAdapter(outputDir, streamOptions)

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
          client = options.client || new Client({ ...Config.global.client, ...options }),
          inputDir = options.dir || process.cwd(),
          progress = rFunction(options.progress),
          url = new URL('/developer/environment/import', client.environment.url),
          requestOptions = {
            query: {
              ...searchParamsToObject(url.searchParams),
              preferUrls: rBool(options.preferUrls, false),
              silent: rBool(options.silent, false)
            },
            method: 'post'
          },
          importStream = new ImportStream(inputDir, options.format),
          ndjsonStream = ndjson.stringify(),
          streamList = [importStream, ndjsonStream]
    if (options.gzip) {
      streamList.push(zlib.createGzip())
    }
    /* eslint-disable one-var */
    const streamChain = pump(...streamList)

    if (!options.local) {
      pathTo(requestOptions, 'headers.accept', 'application/x-ndjson')
      requestOptions.headers['Content-Type'] = 'application/x-ndjson'
      if (options.gzip) {
        requestOptions.headers['Content-Encoding'] = 'application/gzip'
      }
      requestOptions.json = false
      return client.post(url.pathname, streamChain, { requestOptions })
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
