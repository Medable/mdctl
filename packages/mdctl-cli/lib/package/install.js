const Package = require('@medable/mdctl-packages'),
      ndjson = require('ndjson'),
      { Client } = require('@medable/mdctl-api'),
      { isSet } = require('@medable/mdctl-core-utils/values'),
      { Config } = require('@medable/mdctl-core'),
      FileSource = require('@medable/mdctl-packages/lib/sources/file'),
      StreamConcat = require('@medable/mdctl-packages/lib/stream_concat'),
      importEnv = require('../env/import')

module.exports = async(input) => {

  const options = isSet(input) ? input : {},
        client = options.client || new Client({ ...Config.global.client, ...options }),
        inputDir = options.dir || process.cwd(),
        fSource = new FileSource('', inputDir, {})

  await fSource.loadPackageInfo()
  // eslint-disable-next-line one-var
  const pkg = new Package(fSource.name, fSource.version, null, fSource, options)
  console.log(`loading package ${pkg.name}:${pkg.version} and its dependencies`)
  await pkg.evaluate()

  // concatenate all streams in order
  // eslint-disable-next-line one-var
  const streams = []
  // eslint-disable-next-line no-restricted-syntax
  for (const dependency of pkg.dependenciesPackages) {
    console.log(`loading dependency ${dependency.name}:${dependency.version}`)
    // eslint-disable-next-line no-await-in-loop
    streams.push(await dependency.source.getStream(false))
  }
  console.log(`preparing package ${pkg.name}:${pkg.version}`)
  streams.push(await pkg.source.getStream(false))

  const inputStream = new StreamConcat(streams, { objectMode: true })

  // send that to import so all goes into a single stream
  // Concatenate streams and send it
  return importEnv({
    client,
    inputStream,
    ...options,
    outputStream: ndjson.parse()
  })

}
