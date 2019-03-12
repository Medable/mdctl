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
          streamList.push(zlib.createGzip())
        }
        /* eslint-disable one-var */
        const streamChain = pump(...streamList)

        streamChain.on('data', (d) => {
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
          return client.post(url.pathname, streamChain, { requestOptions })
        }

        return new Promise((resolve, reject) => {
          streamChain.on('error', (e) => {
            reject(e)
          })
          streamChain.on('end', () => {
            resolve()
          })
        })

      }

module.exports = importEnv
