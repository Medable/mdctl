const pump = require('pump'),
      ndjson = require('ndjson'),
      zlib = require('zlib'),
      { URL } = require('url'),
      {
        isSet, pathTo, rFunction, rBool
      } = require('@medable/mdctl-core-utils/values'),
      { Transform } = require('stream'),
      { searchParamsToObject } = require('@medable/mdctl-core-utils'),
      { Config } = require('@medable/mdctl-core'),
      ImportStream = require('./stream'),
      Client = require('../../client'),

      importEnv = async(input) => {

        const options = isSet(input) ? input : {},
              client = options.client || new Client({ ...Config.global.client, ...options }),
              inputDir = options.dir || process.cwd(),
              progress = rFunction(options.progress),
              url = new URL('/developer/environment/import', client.environment.url),
              requestOptions = {
                query: {
                  ...searchParamsToObject(url.searchParams),
                  preferUrls: rBool(options.preferUrls, false),
                  silent: rBool(options.silent, false),
                  backup: rBool(options.backup, true)
                },
                method: 'post'
              },
              importStream = new ImportStream(inputDir, options.format),
              ndjsonStream = ndjson.stringify(),
              streamList = [importStream, ndjsonStream]
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
            progress(data.toString())
            this.push(data)
            return callback()
          }
        })
        streamList.push(debuggerStream)

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
          return client.call(url.pathname, {
            method: 'POST',
            body: pump(...streamList),
            requestOptions
          })
        }

        return new Promise((resolve, reject) => {
          const items = [],
                streamChain = pump(...streamList, () => {
                  if (options.debug) {
                    console.debug(`Ending stream, total chunks sent: ${items.length}`)
                  }
                  resolve(options.returnBlob ? Buffer.concat(items) : '')
                })
          streamChain.on('data', d => items.push(d))
          streamChain.on('error', (e) => {
            if (options.debug) {
              console.debug(e)
            }
            reject(e)
          })
          streamChain.resume()
        })

      }

module.exports = importEnv
