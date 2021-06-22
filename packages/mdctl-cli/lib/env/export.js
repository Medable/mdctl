const fs = require('fs'),
      pump = require('pump'),
      ndjson = require('ndjson'),
      path = require('path'),
      isPlainObject = require('lodash.isplainobject'),
      { URL } = require('url'),
      {
        isSet, parseString, pathTo, rBool, isString
      } = require('@medable/mdctl-core-utils/values'),
      Docs = require('@medable/mdctl-docs'),
      {
        searchParamsToObject
      } = require('@medable/mdctl-core-utils'),
      { Config, Fault } = require('@medable/mdctl-core'),
      ExportStream = require('@medable/mdctl-core/streams/export_stream'),
      ExportFileTreeAdapter = require('@medable/mdctl-export-adapter-tree'),
      { Client } = require('@medable/mdctl-api'),
      LockUnlock = require('../lock_unlock'),

      exportEnv = async(input) => {

        const options = isSet(input) ? input : {},
              client = options.client || new Client({ ...Config.global.client, ...options }),
              outputDir = options.dir || process.cwd(),
              packageFile = options.package || `${outputDir}/package.${options.format || 'json'}`,
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

        let manifestFile,
            inputStream

        if (lockUnlock.checkLock(['export'])) {
          throw Fault.create('kWorkspaceLocked', {
            reason: `There is a lock in the workspace ${outputDir} for ${client.environment.endpoint}/${client.environment.env}`
          })
        }

        inputStream = ndjson.parse()
        if (!options.stream) {

          let pkg = {},
              manifest = {}

          if (!isPlainObject(packageFile) && fs.existsSync(packageFile)) {
            try {
              pkg = parseString(fs.readFileSync(packageFile), options.format)
            } catch (e) {
              throw Fault.create({ reason: e.message })
            }
            if (pkg.scripts) {
              if (pkg.scripts.beforeexport) {
                const beforeExport = path.join(outputDir, pkg.scripts.beforeexport)
                if (fs.existsSync(beforeExport)) {
                  pkg.scripts.beforeexport = fs.readFileSync(beforeExport).toString()
                }
              }
              if (pkg.scripts.afterexport) {
                const afterExport = path.join(outputDir, pkg.scripts.afterexport)
                if (fs.existsSync(afterExport)) {
                  pkg.scripts.afterexport = fs.readFileSync(afterExport).toString()
                }
              }
            }
            if (pkg.pipes) {
              if (isString(pkg.pipes.export)) {
                const ingestTransform = path.join(outputDir, pkg.pipes.export)
                if (fs.existsSync(ingestTransform)) {
                  pkg.pipes.export = fs.readFileSync(ingestTransform).toString()
                }
              }
            }
          } else {
            pkg = packageFile
          }

          if (options.manifest) {
            manifest = options.manifest
          } else if (pkg && pkg.manifest) {
            manifestFile = `${outputDir}/${pkg.manifest}`
          } else if (fs.existsSync(`${outputDir}/manifest.${options.format || 'json'}`)) {
            manifestFile = `${outputDir}/manifest.${options.format || 'json'}`
          }

          if (fs.existsSync(manifestFile)) {
            try {
              manifest = parseString(fs.readFileSync(manifestFile), options.format)
            } catch (e) {
              throw Fault.create({ reason: e.message })
            }
          }

          pathTo(requestOptions, 'requestOptions.headers.accept', 'application/x-ndjson')
          await client.call(url.pathname, Object.assign(requestOptions, {
            stream: inputStream, body: { manifest, package: pkg }
          }))
        } else {
          inputStream = options.stream.pipe(ndjson.parse())
        }

        return new Promise((resolve, reject) => {
          const resultStream = pump(inputStream, streamTransform, adapter, (error) => {
            if (error) {
              return reject(error)
            }

            if (options.docs) {
              console.log('Documenting env')
              return Docs.generateDocumentation({
                destination: path.join(outputDir, 'docs'),
                source: path.join(outputDir),
                module: 'env',
              }).then(() => {
                resolve(resultStream)
              })
            }
            return resolve(resultStream)

          })
        })
      }

module.exports = exportEnv
