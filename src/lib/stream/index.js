const { Transform } = require('stream'),
      EventEmitter = require('events'),
      Section = require('./section'),
      Fault = require('../fault'),
      KEYS = ['manifest', 'manifest-dependencies', 'manifest-exports', 'env', 'app', 'notification', 'policy', 'role', 'smsNumber', 'serviceAccount', 'storage', 'configuration', 'facet', 'object', 'script', 'template', 'view']

class StreamTransform extends Transform {

  constructor(options) {
    super(Object.assign({
      objectMode: true
    }, options))
  }

  pipe(dest, options) {
    dest.on('end_writing', () => this.emit('end_writing'))
    super.pipe(dest, options)
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

class StreamWriter extends EventEmitter {

  constructor(stream, options) {
    super()
    // stream.pipe(new StreamBlob(options))
    stream.on('data', this.originData.bind(this))
    stream.on('error', this.originError.bind(this))
    stream.on('end', this.originEnd.bind(this))
    this.transform = new StreamTransform(options)
    this.transform.on('end_writing', (e) => {
      this.propagate('end_writing', e)
    })
    return this.transform
  }

  originData(chunk) {
    this.transform.write(chunk)
  }

  originError(e) {
    console.log(e)
    this.emit('error', e)
  }

  originEnd() {
    this.transform.end()
  }

  propagate(name, e) {
    this.emit(name, e)
  }

}

module.exports = StreamWriter
