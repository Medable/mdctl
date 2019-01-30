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
    dest.on('error', (e) => {
      this.emit('error', e)
    })
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

module.exports = StreamTransform
