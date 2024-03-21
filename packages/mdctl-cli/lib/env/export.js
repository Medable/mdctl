/* eslint-disable max-len */
const { ExportSection } = require('@medable/mdctl-core/streams/section')
const { Transform } = require('stream')

const fs = require('fs'),
      pump = require('pump'),
      ndjson = require('ndjson'),
      path = require('path'),
      isPlainObject = require('lodash.isplainobject'),
      _ = require('lodash'),
      { URL } = require('url'),
      {
        isSet, parseString, pathTo, rBool
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
              { manifest: optionsManifest } = options,
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
              lockUnlock = new LockUnlock(outputDir, client.environment.endpoint, client.environment.env),
              memo = {},
              logStream = new Transform({
                objectMode: true,
                transform(chunk, encoding, cb) {
                  console.log(`[${new Date().toISOString()}] Exporting ${chunk.key}: ${chunk.name || chunk.id}`)
                  this.push(chunk)
                  cb()
                }
              })

        let manifestFile,
            inputStream,
            preExport = () => {},
            postExport = () => {}

        if (lockUnlock.checkLock(['export'])) {
          throw Fault.create('kWorkspaceLocked', {
            reason: `There is a lock in the workspace ${outputDir} for ${client.environment.endpoint}/${client.environment.env}`
          })
        }

        inputStream = ndjson.parse()
        if (!options.stream) {

          let pkg,
              script,
              manifest = {}

          const getScript = (...params) => {
            for (const param of params) { // eslint-disable-line no-restricted-syntax
              if (pkg.scripts[param]) {
                return pkg.scripts[param]
              }
            }
            return null
          }


          if (isPlainObject(packageFile)) {
            pkg = packageFile
          } else if (fs.existsSync(packageFile)) {
            try {
              pkg = parseString(fs.readFileSync(packageFile), options.format)
            } catch (e) {
              throw Fault.create({ reason: e.message })
            }
          }

          if (pkg) {
            if (pkg.scripts) {
              script = getScript('preExport', 'preexport')
              if (script) {
                // eslint-disable-next-line global-require, import/no-dynamic-require
                preExport = require(path.join(outputDir, script))
              }
              script = getScript('postExport', 'postexport')
              if (script) {
                // eslint-disable-next-line global-require, import/no-dynamic-require
                postExport = require(path.join(outputDir, script))
              }
              script = getScript('beforeexport', 'beforeExport')
              if (script) {
                const beforeExport = path.join(outputDir, script)
                if (fs.existsSync(beforeExport)) {
                  pkg.scripts.beforeExport = fs.readFileSync(beforeExport).toString()
                }
              }
              script = getScript('afterexport', 'afterExport')
              if (script) {
                const afterExport = path.join(outputDir, script)
                if (fs.existsSync(afterExport)) {
                  pkg.scripts.afterExport = fs.readFileSync(afterExport).toString()
                }
              }
            }
            if (pkg.pipes) {
              if (_.isString(pkg.pipes.export)) {
                const exportPipe = path.join(outputDir, pkg.pipes.export)
                if (fs.existsSync(exportPipe)) {
                  pkg.pipes.export = fs.readFileSync(exportPipe).toString()
                }
              }
            }
          }

          if (optionsManifest) {
            manifest = optionsManifest
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

          await preExport({
            client, options, manifest, package: pkg, memo
          })

          pathTo(requestOptions, 'requestOptions.headers.accept', 'application/x-ndjson')
          await client.call(url.pathname, Object.assign(requestOptions, {
            stream: inputStream, body: { manifest, package: pkg }
          }))

        } else {
          inputStream = options.stream.pipe(ndjson.parse())
        }

        return new Promise((resolve, reject) => {
          const resultStream = pump(inputStream, streamTransform, logStream, adapter, async(err) => {

            try {
              await postExport({
                client, err, options, memo
              })
            } catch (e) {
              return reject(e)
            }

            if (err) {
              return reject(err)
            }

            if (!streamTransform.complete()) {
              return reject(new Error('Export not complete!'))
            }

            ExportSection.clearSectionsWithResources()

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
