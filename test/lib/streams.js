const { assert } = require('chai'),
      fs = require('fs'),
      path = require('path'),
      glob = require('glob'),
      rimraf = require('rimraf'),
      _ = require('lodash'),
      Environment = require('../../src/lib/env'),
      MdCtlCli = require('../../src/cli/mdctl')

describe('Export and Import Adapters', () => {

  let blob,
      streamedBlob = null

  beforeEach(() => {
    blob = fs.createReadStream(`${process.cwd()}/test/data/blob.ndjson`)
    streamedBlob = fs.createReadStream(`${process.cwd()}/test/data/blob_with_streams.ndjson`)
  })

  afterEach(() => {
    blob = null
    streamedBlob = null
  })

  it('export using file adapter with default layout', async() => {
    const tempDir = path.join(process.cwd(), `output-${new Date().getTime()}`),
          cli = new MdCtlCli(),
          client = await cli.getApiClient({ credentials: await cli.getAuthOptions() })
    return Environment.export({
      client,
      stream: blob,
      dir: tempDir,
      format: 'yaml'
    }).then(() => {
      glob('**/*.{yaml,js,png,jpeg,ico,gif,html,txt}', { cwd: tempDir }, (err, files) => {
        rimraf.sync(tempDir)
        if (err) {
          return Promise.reject(err)
        }
        assert(files.length === 119, 'there are some missing files created')
        return true
      })
    })
  })

  it('export using streamIds for assets', async() => {
    const tempDir = path.join(process.cwd(), `output-${new Date().getTime()}`),
          cli = new MdCtlCli(),
          client = await cli.getApiClient({ credentials: await cli.getAuthOptions() })
    return Environment.export({
      client,
      stream: streamedBlob,
      dir: tempDir,
      format: 'yaml'
    }).then(() => {
      glob('**/*.{yaml,js,png,jpeg,ico,gif,html,txt}', { cwd: tempDir }, (err, files) => {
        rimraf.sync(tempDir)
        if (err) {
          return Promise.reject(err)
        }
        assert(files.length === 120, 'there are some missing files created')
        return true
      })
    })
  })

  it('testing import adapter', async() => {

    const tempDir = path.join(process.cwd(), `output-${new Date().getTime()}`),
          cli = new MdCtlCli(),
          client = await cli.getApiClient({ credentials: await cli.getAuthOptions() })
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
          client,
          dir: tempDir,
          format: 'yaml',
          progress: (line) => {
            items.push(line)
          }
        }).then(() => {
          rimraf.sync(tempDir)
          const loadedItems = _.map(items, i => JSON.parse(i)),
                blobItems = _.groupBy(_.filter(loadedItems, i => i.data && i.streamId), 'streamId'),
                otherItems = _.filter(loadedItems, i => !i.data && !i.streamId)
          assert(otherItems.length === 42, 'there are more/less files than loaded')
          assert(Object.keys(blobItems).length === 1, 'there are more/less blob items than loaded')
          return true
        })
      }
      return Promise.reject(new Error('Exported files not found'))
    })
  })
})
