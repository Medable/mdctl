const pump = require('pump'),
      ndjson = require('ndjson'),
      zlib = require('zlib'),
      { URL } = require('url'),
      {
        isSet, pathTo, rFunction, rBool
      } = require('@medable/mdctl-core-utils/values'),
      { Transform } = require('stream'),
      {
        searchParamsToObject
      } = require('@medable/mdctl-core-utils'),
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
        const hrstart = process.hrtime()
        const streamChain = pump(
          ...streamList,
          new Transform({
            objectMode: true,
            highWaterMark: 1,
            transform(data, encoding, callback) {


              this.push(data)
              callback()
              const hrend = process.hrtime(hrstart)
              if (options.debug) {
                console.info('Execution time (hr): %ds %dms', hrend[0], hrend[1] / 1000000)
                console.debug(data)
              }
              progress(data)

            }
          })
        )

        if (!options.dryRun) {
          pathTo(requestOptions, 'headers.accept', 'application/x-ndjson')
          requestOptions.headers['Content-Type'] = 'application/x-ndjson'
          if (options.gzip) {
            requestOptions.headers['Content-Type'] = 'application/gzip'
            requestOptions.headers['Content-Encoding'] = 'gzip'
          }
          requestOptions.json = false
          if (options.debug) {
            console.log(`calling api ${url.pathname} with params ${JSON.stringify(requestOptions)}`)
          }
          return client.call(url.pathname, { method: 'POST', body: streamChain, requestOptions })
        }

        return new Promise((resolve, reject) => {
          streamChain.on('error', (e) => {
            if (options.debug) {
              console.debug(e)
            }
            reject(e)
          })
          streamChain.on('end', () => {
            if (options.debug) {
              console.debug('Ending stream')
            }
            resolve()
          })
          streamChain.resume()
        })

      }

module.exports = importEnv
