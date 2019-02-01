const { Transform } = require('stream'),
      Section = require('./section'),
      Fault = require('../fault'),
      KEYS = ['manifest', 'manifest-dependencies', 'manifest-exports', 'env', 'app', 'notification', 'policy', 'role', 'smsNumber', 'serviceAccount', 'storageLocation', 'configuration', 'facet', 'object', 'script', 'template', 'view']

class StreamTransform extends Transform {

  constructor(options) {
    super(Object.assign({
      objectMode: true
    }, options))
  }

  checkKeys(name) {
    return KEYS.indexOf(name) > -1 || (typeof name === 'string' && (name.indexOf('c_') === 0 || name.includes('__')))
  }

  _transform(chunk, enc, done) {
    // Lets push only the allowed keys
    if (!chunk.object) {
      throw new Fault('kMissingObjectKey', 'There is no object property', 400)
    }
    if (chunk.object === 'fault') {
      throw Fault.from(chunk)
    } else if (this.checkKeys(chunk.object)) {
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
