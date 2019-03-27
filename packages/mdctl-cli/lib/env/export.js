const fs = require('fs'),
      pump = require('pump'),
      ndjson = require('ndjson'),
      { URL } = require('url'),
      {
        isSet, parseString, pathTo, rBool
      } = require('@medable/mdctl-core-utils/values'),
      {
        searchParamsToObject
      } = require('@medable/mdctl-core-utils'),
      { Config, Fault } = require('@medable/mdctl-core'),
      ExportStream = require('@medable/mdctl-core/streams/export_stream'),
      ExportFileTreeAdapter = require('@medable/mdctl-export-adapter-tree'),
      { Client } = require('@medable/mdctl-api'),

      exportEnv = async(input) => {

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
          if (!_.isObject(manifestFile) && fs.existsSync(manifestFile)) {
            try {
              manifest = parseString(fs.readFileSync(manifestFile), options.format)
            } catch (e) {
              return Fault.create({ reason: e.message })
            }
          } else {
            manifest = manifestFile
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
      }

module.exports = exportEnv
