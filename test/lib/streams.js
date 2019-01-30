const { assert } = require('chai'),
      fs = require('fs'),
      path = require('path'),
      glob = require('glob'),
      rimraf = require('rimraf'),
      ndjson = require('ndjson'),
      Stream = require('../../src/lib/stream'),
      FileAdapter = require('../../src/lib/stream/adapters/file_adapter')

describe('Adapters', () => {

  let blob = null

  beforeEach(() => {
    blob = fs.createReadStream(`${process.cwd()}/test/data/blob.ndjson`)
  })

  afterEach(() => {
    blob = null
  })

  it('export using file adapter with default layout', (done) => {
    const tempDir = path.join(process.cwd(), `output-${new Date().getTime()}`),
          stream = ndjson.parse(),
          format = 'yaml',
          streamWriter = new Stream(stream, { format })

    streamWriter.pipe(new FileAdapter(tempDir, { format }))
    blob.pipe(stream)
    streamWriter.on('end_writing', () => {
      glob('**/*.{yaml,js,png,jpeg,ico,gif}', { cwd: tempDir }, (err, files) => {
        if (err) {
          return done(err)
        }
        rimraf.sync(tempDir)
        assert(files.length === 51, 'there are some missing files created')
        return done()
      })
    })
  })

  it('export using file adapter with single blob layout', (done) => {
    const tempDir = path.join(process.cwd(), `output-${new Date().getTime()}`),
          stream = ndjson.parse(),
          format = 'yaml',
          streamWriter = new Stream(stream, { format })

    streamWriter.pipe(new FileAdapter(tempDir, { format, layout: 'blob' }))
    blob.pipe(stream)

    streamWriter.on('end_writing', () => {
      glob('**/*.{yaml,js,png,jpeg,ico,gif}', { cwd: tempDir }, (err, files) => {
        if (err) {
          return done(err)
        }
        rimraf.sync(tempDir)
        assert(files.length === 6, 'there are more/less files than created')
        return done()
      })
    })
  })

})
