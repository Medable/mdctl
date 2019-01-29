const { PassThrough, Transform } = require('stream'),
      Section = require('./section'),
      Fault = require('../fault'),
      KEYS = ['manifest', 'manifest-dependencies', 'manifest-exports', 'env', 'app', 'notification', 'policy', 'role', 'smsNumber', 'serviceAccount', 'storage', 'configuration', 'facet', 'object', 'script', 'template', 'view']

class StreamTransform extends Transform {

  constructor(options) {
    super(Object.assign({
      objectMode: true
    }, options))
  }

  _transform(chunk, enc, done) {
    // Lets push only the allowed keys
    if (!chunk.object) {
      throw new Fault('kMissingObjectKey', 'There is no object property', 404)
    }
    if (chunk.object === 'fault') {
      throw Fault.from(chunk)
    } else if (KEYS.indexOf(chunk.object) > -1) {
      const section = new Section(chunk, chunk.object)
      this.push(section)
    } else {
      console.log('NOT', chunk)
    }
    done()

  }

  _flush(done) {
    done()
  }

}

class StreamBlob extends PassThrough {

  constructor(options) {
    super(Object.assign({
      objectMode: true
    }, options))

    // this.jsonStream = JSONStream.parse('$*')
    this.streamTransform = new StreamTransform(options)

    // this.jsonStream.on('error', e => this.emit('error', e))
    this.streamTransform.on('error', e => this.emit('error', e))

    this.on('pipe', (source) => {
      source.unpipe(this)
      this.transformStream = source.pipe(this.streamTransform)
    })
  }

  pipe(dest, options) {
    return this.transformStream.pipe(dest, options)
  }

}


module.exports = StreamBlob
