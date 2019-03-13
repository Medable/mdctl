const pump = require('pump'),
      ndjson = require('ndjson'),
      zlib = require('zlib'),
      { URL } = require('url'),
      {
        isSet, pathTo, rFunction, rBool
      } = require('@medable/mdctl-core-utils/values'),
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
          if(options.debug) {
            console.log('Adding gzip stream transform')
          }
          streamList.push(zlib.createGzip())
        }
        /* eslint-disable one-var */
        const streamChain = pump(...streamList)

        streamChain.on('data', (d) => {
          if(options.debug) {
            console.debug(d)
          }
          progress(d)
        })

        if (!options.local) {
          pathTo(requestOptions, 'headers.accept', 'application/x-ndjson')
          requestOptions.headers['Content-Type'] = 'application/x-ndjson'
          if (options.gzip) {
            requestOptions.headers['Content-Type'] = 'application/gzip'
            requestOptions.headers['Content-Encoding'] = 'gzip'
          }
          requestOptions.json = false
          if(options.debug) {
            console.log(`calling api ${url.pathname} with params ${JSON.stringify(requestOptions)}`)
          }
          return client.call(url.pathname, Object.assign({ method: 'POST', body: streamChain }, requestOptions))
        }

        return new Promise((resolve, reject) => {
          streamChain.on('error', (e) => {
            if(options.debug) {
              console.log(e)
            }
            reject(e)
          })
          streamChain.on('end', () => {
            if(options.debug) {
              console.log('Ending stream')
            }
            resolve()
          })
        })

      }

module.exports = importEnv
