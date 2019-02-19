const { assert } = require('chai'),
      fs = require('fs'),
      path = require('path'),
      glob = require('glob'),
      pump = require('pump'),
      rimraf = require('rimraf'),
      ndjson = require('ndjson'),
      _ = require('lodash'),
      { ExportStream, ImportStream } = require('../../src/lib/stream'),
      { ExportFileAdapter } = require('../../src/lib/stream/adapters/file_adapter')

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

  it('export using file adapter with default layout', (done) => {
    const tempDir = path.join(process.cwd(), `output-${new Date().getTime()}`),
          stream = ndjson.parse(),
          format = 'yaml',
          streamWriter = new ExportStream(stream, { format }),
          onEnd = (error) => {
            if (error) {
              rimraf.sync(tempDir)
              done(error)
            }
            glob('**/*.{yaml,js,png,jpeg,ico,gif,html,txt}', { cwd: tempDir }, (err, files) => {
              rimraf.sync(tempDir)
              if (err) {
                done(err)
              } else {
                assert(files.length === 119, 'there are some missing files created')
                done()
              }
            })
          }

    pump(blob, stream, streamWriter, new ExportFileAdapter(tempDir, { format }), onEnd)
  })

  it('export using streamIds for assets', (done) => {
    const tempDir = path.join(process.cwd(), `output-${new Date().getTime()}`),
          stream = ndjson.parse(),
          format = 'yaml',
          streamWriter = new ExportStream(stream, { format }),
          onEnd = (error) => {
            if (error) {
              rimraf.sync(tempDir)
              done(error)
            }
            glob('**/*.{yaml,js,png,jpeg,ico,gif,html,txt}', { cwd: tempDir }, (err, files) => {
              rimraf.sync(tempDir)
              if (err) {
                done(err)
              } else {
                assert(files.length === 120, 'there are some missing files created')
                done()
              }
            })
          }

    pump(streamedBlob, stream, streamWriter, new ExportFileAdapter(tempDir, { format }), onEnd)
  })

  it('testing import adapter', (done) => {

    const tempDir = path.join(process.cwd(), `output-${new Date().getTime()}`),
          stream = ndjson.parse(),
          format = 'yaml',
          streamWriter = new ExportStream(stream, { format }),
          fileWriter = new ExportFileAdapter(tempDir, { format }),
          onEnd = async(error) => {
            if (error) {
              rimraf.sync(tempDir)
              done(error)
            }

            // Update a file in order to get a blob to send
            if (fs.existsSync(`${tempDir}/env/assets/env.logo.content.jpeg`)) {
              const exportedFile = fs.createReadStream(`${process.cwd()}/test/data/medable.jpg`)
              exportedFile.pipe(fs.createWriteStream(`${tempDir}/env/assets/env.logo.content.jpeg`))

              const importAdapter = new ImportStream(tempDir, format),
                    ndStream = ndjson.stringify(),
                    items = []

              ndStream.on('data', line => items.push(line))
              pump(importAdapter, ndStream, () => {
                rimraf.sync(tempDir)
                const loadedItems = _.map(items, i => JSON.parse(i)),
                      blobItems = _.groupBy(_.filter(loadedItems, i => i.data && i.streamId), 'streamId'),
                      otherItems = _.filter(loadedItems, i => !i.data && !i.streamId)
                assert(otherItems.length === 42, 'there are more/less files than loaded')
                assert(Object.keys(blobItems).length === 1, 'there are more/less blob items than loaded')
                done()
              })
              // call this in order to trigger end event or declare a data listener
              // ndStream.resume()
            } else {
              done('Error')
            }
          }
    pump(blob, stream, streamWriter, fileWriter, onEnd)
  })

})
