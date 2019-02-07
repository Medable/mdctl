const { assert } = require('chai'),
      fs = require('fs'),
      { parse } = require('ndjson'),
      { createHash } = require('crypto'),
      { Transform } = require('stream'),
      { InputStream, OutputStream } = require('../../src/lib/stream/chunk-stream')

class MD5Stream extends Transform {

  constructor(opts) {
    super(opts)
    this.hash = createHash('md5')
  }

  _transform(chunk, encoding, callback) {
    this.hash.update(chunk)
    callback(null, chunk)
  }

  _flush(callback) {
    this.emit('md5', this.hash.digest('hex'))
    callback()
  }

}

describe('Chunk Stream', () => {

  const template = {
    resourceId: 'abc',
    object: 'stream'
  }

  let blob = null

  beforeEach((callback) => {

    blob = fs.createReadStream(`${__dirname}/../data/medable.jpg`)
    callback()

  })

  afterEach((callback) => {
    blob = null
    callback()
  })

  it('read and output the original result from json objects', (callback) => {

    const os = new OutputStream({
            chunkSize: 8192,
            ndjson: false,
            template
          }),

          is = new InputStream({
            filter: object => object
              && object.resourceId === template.resourceId
              && object.object === template.object
          }),
          inMd5 = new MD5Stream(),
          outMd5 = new MD5Stream()

    let inHash = null,
        outHash = null

    inMd5.on('md5', (md5) => {
      inHash = md5
    })
    outMd5.on('md5', (md5) => {
      outHash = md5
    })

    blob
      .pipe(inMd5)
      .pipe(os)
      .pipe(is)
      .pipe(outMd5)
      .on('data', () => {

      })
      .on('end', () => {
        assert(inHash === outHash, 'hashes of input and output should match')
        callback()
      })
      .on('error', callback)

  })

  it('read and output the original result from ndjson stream', (callback) => {

    const os = new OutputStream({
            chunkSize: 8192,
            ndjson: true,
            template
          }),

          is = new InputStream({
            filter: object => object
              && object.resourceId === template.resourceId
              && object.object === template.object
          }),
          inMd5 = new MD5Stream(),
          outMd5 = new MD5Stream()

    let inHash = null,
        outHash = null

    inMd5.on('md5', (md5) => {
      inHash = md5
    })
    outMd5.on('md5', (md5) => {
      outHash = md5
    })

    blob
      .pipe(inMd5)
      .pipe(os)
      .pipe(parse())
      .pipe(is)
      .pipe(outMd5)
      .on('data', () => {

      })
      .on('end', () => {
        assert(inHash === outHash, 'hashes of input and output should match')
        callback()
      })
      .on('error', callback)

  })

})
