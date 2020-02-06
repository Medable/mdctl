const fs = require('fs'),
      pump = require('pump'),
      ndjson = require('ndjson'),
      path = require('path'),
      isPlainObject = require('lodash.isplainobject'),
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
      LockUnlock = require('../lock_unlock'),
      Docs = require('@medable/mdctl-docs'),

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
                  silent: rBool(options.silent, false),
                  backup: rBool(options.backup, true)
                },
                method: 'post'
              },
              streamOptions = {
                format: options.format,
                clearOutput: options.clear
              },
              streamTransform = new ExportStream(),
              adapter = options.adapter || new ExportFileTreeAdapter(outputDir, streamOptions),
              // eslint-disable-next-line max-len
              lockUnlock = new LockUnlock(outputDir, client.environment.endpoint, client.environment.env)

        if (lockUnlock.checkLock(['export'])) {
          throw Fault.create('kWorkspaceLocked', {
            reason: `There is a lock in the workspace ${outputDir} for ${client.environment.endpoint}/${client.environment.env}`
          })
        }

        let inputStream = ndjson.parse()
        if (!options.stream) {

          let manifest = {}
          if (!isPlainObject(manifestFile) && fs.existsSync(manifestFile)) {
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

            if (options.docs){
              console.log('Documenting env')
              Docs.generateDocumentation({
                destination: path.join(outputDir, 'env', 'docs'),
                source: path.join(outputDir, 'env'),
                module: 'env',
              })
            }
            return resolve(resultStream)
          })
        })
      }

module.exports = exportEnv
