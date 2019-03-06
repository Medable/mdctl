const { assert } = require('chai'),
      fs = require('fs'),
      path = require('path'),
      zlib = require('zlib'),
      rimraf = require('rimraf'),
      _ = require('lodash'),
      Environment = require('../../../src/lib/env'),
      MdCtlCli = require('../../../src/cli/mdctl')

describe('Environment Import', () => {

  let blob

  beforeEach(() => {
    blob = fs.createReadStream(`${process.cwd()}/test/data/blob.ndjson`)
  })

  afterEach(() => {
    blob = null
  })

  it('testing import adapter', async() => {

    const tempDir = path.join(process.cwd(), `output-for-import-${new Date().getTime()}`),
          cli = new MdCtlCli()
    await cli.configure()
    /* eslint-disable one-var */
    const client = await cli.getApiClient({ credentials: await cli.getAuthOptions() })
    return Environment.export({
      client,
      stream: blob,
      dir: tempDir,
      format: 'yaml'
    }).then(() => {
      if (fs.existsSync(`${tempDir}/env/assets/env.logo.content.jpeg`)) {
        const exportedFile = fs.createReadStream(`${process.cwd()}/test/data/medable.jpg`),
              items = []
        exportedFile.pipe(fs.createWriteStream(`${tempDir}/env/assets/env.logo.content.jpeg`))
        return Environment.import({
          gzip: true,
          local: true,
          client,
          dir: tempDir,
          format: 'yaml',
          progress: (line) => {
            items.push(line)
          }
        }).then(() => {
          rimraf.sync(tempDir)
          zlib.unzip(Buffer.concat(items), (err, dezipped) => {
            const result = _.filter(dezipped.toString().split('\n'), i => i !== ''),
                  loadedItems = _.map(result, i => JSON.parse(i)),
                  blobItems = _.groupBy(_.filter(loadedItems, i => i.data && i.streamId), 'streamId'),
                  otherItems = _.filter(loadedItems, i => !i.data && !i.streamId)
            assert(otherItems.length === 42, 'there are more/less files than loaded')
            assert(Object.keys(blobItems).length === 1, 'there are more/less blob items than loaded')
          })
          return true
        }).catch((e) => {
          rimraf.sync(tempDir)
          return Promise.reject(e)
        })
      }
      return Promise.reject(new Error('Exported files not found'))
    }).catch((e) => {
      rimraf.sync(tempDir)
      return Promise.reject(e)
    })
  })
})
