const { assert } = require('chai'),
      fs = require('fs'),
      Stream = require('../src/lib/stream'),
      FileAdapter = require('../src/lib/stream/adapters/file_adapter'),
      ConsoleAdapter = require('../src/lib/stream/adapters/console_adapter'),
      MemoryAdapter = require('../src/lib/stream/adapters/memory_adapter')

describe('Adapters', () => {


  it('export using file adapter', (done) => {
    const stream = fs.createReadStream('/Users/gastonrobledo/Downloads/blob.json'),
          s = new Stream(),
          c = new FileAdapter(null, { format: 'yaml', layout: 'single_file' })

    stream.pipe(s).pipe(c)

    c.on('finish', () => {
      done()
    })

  })

  it('export using console adapter', (done) => {
    const stream = fs.createReadStream('/Users/gastonrobledo/Downloads/blob.json'),
          s = new Stream(),
          c = new ConsoleAdapter()

    stream.pipe(s).pipe(c)

    c.on('finish', () => {
      done()
    })

  })

  it('export using memory adapter', (done) => {
    const stream = fs.createReadStream('/Users/gastonrobledo/Downloads/blob.json'),
          s = new Stream(),
          c = new MemoryAdapter()

    stream.pipe(s).pipe(c)

    c.on('data', (data) => {
      console.log(data)
    })

    c.on('finish', () => {
      done()
    })

  })

})
