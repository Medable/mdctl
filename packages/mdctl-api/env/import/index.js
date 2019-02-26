const pump = require ('pump'),
  ndjson = require ('ndjson'),
  zlib = require ('zlib'),
  {URL} = require ('url'),
  {
    isSet, pathTo, rFunction, rBool
  } = require ('mdctl-core-utils/values'),
  {
    searchParamsToObject
  } = require ('mdctl-core-utils'),
  { Config } = require ('mdctl-core'),
  { ImportStream} = require ('./stream'),
  Client = require ('../../client')

const importEnv = async (input) => {

  const options = isSet (input) ? input : {},
    client = options.client || new Client ({...Config.global.client, ...options}),
    inputDir = options.dir || process.cwd (),
    progress = rFunction (options.progress),
    url = new URL ('/developer/environment/import', client.environment.url),
    requestOptions = {
      query: {
        ...searchParamsToObject (url.searchParams),
        preferUrls: rBool (options.preferUrls, false),
        silent: rBool (options.silent, false)
      },
      method: 'post'
    },
    importStream = new ImportStream (inputDir, options.format),
    ndjsonStream = ndjson.stringify (),
    gz = zlib.createGzip (),
    streamChain = pump (importStream, ndjsonStream, gz)

  if (!options.local) {
    pathTo (requestOptions, 'headers.accept', 'application/x-ndjson')
    requestOptions.headers['Content-Type'] = 'application/x-ndjson'
    requestOptions.headers['Content-Encoding'] = 'application/gzip'
    requestOptions.json = false
    await client.post (url.pathname, streamChain, {requestOptions})
  }

  return new Promise ((resolve, reject) => {
    streamChain.on ('data', (d) => {
      progress (d)
    })
    streamChain.on ('error', (e) => {
      reject (e)
    })
    streamChain.on ('end', () => {
      resolve ()
    })
  })

}

module.exports = importEnv
