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
            inputStream,
            preExport = () => {},
            postExport = () => {},
            memo = {}

        if (lockUnlock.checkLock(['export'])) {
          throw Fault.create('kWorkspaceLocked', {
            reason: `There is a lock in the workspace ${outputDir} for ${client.environment.endpoint}/${client.environment.env}`
          })
        }

        inputStream = ndjson.parse()
        if (!options.stream) {

          let packageData,
              script,
              manifest = {},
              getScript = (...params) => {
                for (const param of params) {
                  if (packageData.scripts[param]) {
                    return packageData.scripts[param]
                  }
                }
                return null
              }

          if (isPlainObject(packageFile)) {
            packageData = packageFile
          } else if (fs.existsSync(packageFile)) {
            try {
              packageData = parseString(fs.readFileSync(packageFile), options.format)
            } catch (e) {
              throw Fault.create({ reason: e.message })
            }
          }

          if (packageData) {
            if (packageData.scripts) {
              script = getScript('preExport', 'preexport')
              if (script) {
                preExport = require(path.join(outputDir, script))
              }
              script = getScript('postExport', 'postexport')
              if (script) {
                postExport = require(path.join(outputDir, script))
              }
              script = getScript('beforeexport', 'beforeExport')
              if (script) {
                const beforeExport = path.join(outputDir, script)
                if (fs.existsSync(beforeExport)) {
                  packageData.scripts.beforeExport = fs.readFileSync(beforeExport).toString()
                }
              }
              script = getScript('afterexport', 'afterExport')
              if (script) {
                const afterExport = path.join(outputDir, script)
                if (fs.existsSync(afterExport)) {
                  packageData.scripts.afterExport = fs.readFileSync(afterExport).toString()
                }
              }
            }
            if (packageData.pipes) {
              if (_.isString(packageData.pipes.export)) {
                const exportPipe = path.join(outputDir, packageData.pipes.export)
                if (fs.existsSync(exportPipe)) {
                  packageData.pipes.export = fs.readFileSync(exportPipe).toString()
                }
              }
            }
          }

          if (options.manifest) {
            manifest = options.manifest
          } else if (packageData && packageData.manifest) {
            manifestFile = `${outputDir}/${packageData.manifest}`
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

          await preExport({ client, options, manifest, package: packageData, memo })

          pathTo(requestOptions, 'requestOptions.headers.accept', 'application/x-ndjson')
          await client.call(url.pathname, Object.assign(requestOptions, {
            stream: inputStream, body: { manifest, package: packageData }
          }))

        } else {
          inputStream = options.stream.pipe(ndjson.parse())
        }

        return new Promise((resolve, reject) => {
          const resultStream = pump(inputStream, streamTransform, adapter, async (err) => {

            try {
              await postExport({ client, err, options, memo })
            } catch(e) {
              err = e
            }

            if (err) {
              return reject(err)
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
const { privatesAccessor } = require('@medable/mdctl-core-utils/privates')
const _ = require('lodash')

module.exports = exportEnv
