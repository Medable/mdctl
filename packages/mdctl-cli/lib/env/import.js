const pump = require('pump'),
      ndjson = require('ndjson'),
      zlib = require('zlib'),
      { URL } = require('url'),
      {
        isSet, pathTo, rFunction, rBool, rString
      } = require('@medable/mdctl-core-utils/values'),
      { Transform } = require('stream'),
      { pluralize } = require('inflection'),
      { searchParamsToObject } = require('@medable/mdctl-core-utils'),
      { Config, Fault } = require('@medable/mdctl-core'),
      ImportStream = require('@medable/mdctl-core/streams/import_stream'),
      ImportFileTreeAdapter = require('@medable/mdctl-import-adapter'),
      { Client } = require('@medable/mdctl-api'),
      LockUnlock = require('../lock_unlock'),
      isReadableStream = stream => stream !== null
          && typeof stream === 'object'
          && typeof stream.pipe === 'function'
          && stream.readable !== false
          // eslint-disable-next-line no-underscore-dangle
          && typeof stream._read === 'function'
          // eslint-disable-next-line no-underscore-dangle
          && typeof stream._readableState === 'object',

      importEnv = async(input) => {

        let manifest = input && input.manifest,
            preImport,
            postImport

        if (rString(input && input.resource)) {

          const resource = rString(input && input.resource),
                parts = resource.split('.'),
                objectName = pluralize(parts[0]),
                name = parts.length > 1 ? parts.slice(1).join('.') : '*'

          manifest = { // eslint-disable-line no-param-reassign
            object: 'manifest',
            [objectName]: objectName === 'objects'
              ? [{ name, includes: ['*'] }]
              : { includes: [name] }
          }
        }

        const options = isSet(input) ? input : {},
              client = options.client || new Client({ ...Config.global.client, ...options }),
              progress = rFunction(options.progress),
              memo = {},
              url = new URL('/developer/environment/import', client.environment.url),
              query = {
            ...searchParamsToObject(url.searchParams),
            preferUrls: rBool(options.preferUrls, false),
            silent: rBool(options.silent, false),
            backup: rBool(options.backup, false),
            production: rBool(options.production, false),
            triggers: rBool(options.triggers, false)
          },
              requestOptions = {},
              ndjsonStream = ndjson.stringify()

        // eslint-disable-next-line one-var
        let { inputStream } = options

        if (!inputStream || !isReadableStream(inputStream)) {

          const inputDir = options.dir || process.cwd(),
                { endpoint, env } = client.credentials.environment,
                lockUnlock = new LockUnlock(inputDir, endpoint, env)

          if (lockUnlock.checkLock(['import'])) {
            throw Fault.create('kWorkspaceLocked', {
              reason: `There is a lock in the workspace ${inputDir} for ${endpoint}/${env}`,
              path: inputDir
            })
          }

          // eslint-disable-next-line one-var
          const fileAdapter = new ImportFileTreeAdapter(inputDir, options.format, manifest)
          inputStream = new ImportStream(fileAdapter)

          preImport = fileAdapter.preImport()
          postImport = fileAdapter.postImport()
        }

        // eslint-disable-next-line one-var
        const streamList = [inputStream, ndjsonStream]


        if (options.gzip) {
          if (options.debug) {
            console.debug('Adding gzip stream transform')
          }
          streamList.push(zlib.createGzip())
        }
        /* eslint-disable one-var */
        let hrstart = process.hrtime()
        const debuggerStream = new Transform({
          transform(data, encoding, callback) {
            const hrend = process.hrtime(hrstart)
            hrstart = process.hrtime()
            if (options.debug) {
              console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000)
              console.debug(data.toString())
            }
            progress(data)
            this.push(data)
            return callback()
          }
        })
        streamList.push(debuggerStream)

        if (preImport) {
          await preImport({
            client, options, inputStream, memo
          })
        }

        if (!options.dryRun) {
          pathTo(requestOptions, 'headers.accept', 'application/x-ndjson')
          requestOptions.headers['Content-Type'] = 'application/x-ndjson'
          if (options.gzip) {
            requestOptions.headers['Content-Type'] = 'application/x-ndjson'
            requestOptions.headers['Content-Encoding'] = 'gzip'
          }
          requestOptions.json = false
          if (options.debug) {
            console.log(`calling api ${url.pathname} with params ${JSON.stringify(requestOptions)}`)
          }
          const response = await client.call(url.pathname, {
            method: 'POST',
            body: pump(...streamList),
            stream: options.outputStream,
            query,
            requestOptions
          })
          return { response, postImport, memo }
        }

        const response = pump(...streamList)
        return { response, postImport, memo }

      }
const Stream = require("stream");

module.exports = importEnv
