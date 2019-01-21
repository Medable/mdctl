const { assert, expect } = require('chai'),
      sinon = require('sinon'),
      fs = require('fs'),
      path = require('path'),
      glob = require('glob'),
      rimraf = require('rimraf'),
      _ = require('lodash'),
      { Readable } = require('stream'),
      Fault = require('../src/lib/fault'),
      Stream = require('../src/lib/stream'),
      FileAdapter = require('../src/lib/stream/adapters/file_adapter'),
      ConsoleAdapter = require('../src/lib/stream/adapters/console_adapter'),
      MemoryAdapter = require('../src/lib/stream/adapters/memory_adapter')

describe('Adapters', () => {

  let blob = null

  beforeEach(() => {
    blob = fs.createReadStream(`${__dirname}/data/blob.json`)
  })

  afterEach(() => {
    blob = null
  })

  it('load with a invalid blob structure', (done) => {
    const fakeBlob = {
            env: [],
            test: ''
          },
          readableStream = new Readable({ objectMode: true })
    readableStream.pipe(new Stream()).on('error', (e) => {
      if (e instanceof Fault) {
        assert(e.code === 'fkInvalidBlob', 'InvalidBlob fault was expected')
      }
      done()
    })
    readableStream.push(new Buffer.from(JSON.stringify(fakeBlob)))
    readableStream.push(null)
  })

  it('export using file adapter with default layout', (done) => {
    const tempDir = path.join(process.cwd(), `output-${new Date().getTime()}`),
          s = new Stream(),
          c = new FileAdapter(tempDir, { format: 'yaml' })

    blob.pipe(s).pipe(c).on('finish', () => {
      glob('**/*.{yaml,js}', { cwd: tempDir }, (err, files) => {
        if (err) {
          return done(err)
        }
        assert(files.length === 45, 'there are some missing files created')
        rimraf.sync(tempDir)
        return done()
      })
    })
  })

  it('export using file adapter with single blob layout', (done) => {
    const tempDir = path.join(process.cwd(), `output-${new Date().getTime()}`),
          s = new Stream(),
          c = new FileAdapter(tempDir, { format: 'yaml', layout: 'blob' })

    blob.pipe(s).pipe(c).on('finish', () => {
      glob('**/*.yaml', { cwd: tempDir }, (err, files) => {
        if (err) {
          return done(err)
        }
        assert(files.length === 1, 'there are more/less files than created')
        rimraf.sync(tempDir)
        return done()
      })
    })
  })

  it('export using console adapter', (done) => {
    const s = new Stream(),
          c = new ConsoleAdapter()

    sinon.stub(console, 'log').returns(undefined)

    blob.pipe(s).pipe(c).on('finish', () => {
      try {
        const data = _.map(console.log.args, item => JSON.parse(item[0]))
        console.log.restore()
        expect(data.length).to.equal(5)
        expect(data[0]).to.have.property('env')
        expect(data[1]).to.have.property('objects')
        expect(data[2]).to.have.property('scripts')
        expect(data[3]).to.have.property('views')
        expect(data[4]).to.have.property('templates')
        done()
      } catch (e) {
        done(e)
      }
    })

  })

  it('export using memory adapter', (done) => {
    const s = new Stream(),
          c = new MemoryAdapter(),

          buffer = []
    blob.pipe(s).pipe(c).on('data', (data) => {
      buffer.push(data)
    }).on('finish', () => {
      try {
        expect(buffer.length).to.equal(5)
        expect(buffer[0]).to.have.property('env')
        expect(buffer[1]).to.have.property('objects')
        expect(buffer[2]).to.have.property('scripts')
        expect(buffer[3]).to.have.property('views')
        expect(buffer[4]).to.have.property('templates')
        done()
      } catch (e) {
        done(e)
      }
    })
  })

})
