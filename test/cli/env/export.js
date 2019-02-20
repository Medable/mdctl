const { assert } = require('chai'),
      fs = require('fs'),
      path = require('path'),
      glob = require('glob'),
      rimraf = require('rimraf'),
      Environment = require('../../../src/lib/env'),
      MdCtlCli = require('../../../src/cli/mdctl')

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
})
