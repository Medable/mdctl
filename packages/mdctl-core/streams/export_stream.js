const { Transform } = require('stream'),
      { isCustomName } = require('@medable/mdctl-core-utils/values'),
      { ExportSection, StreamChunk } = require('./section'),
      Fault = require('../fault'),
      KEYS = ['manifest', 'manifest-dependencies', 'manifest-exports', 'env', 'app', 'config', 'notification', 'policy', 'role', 'smsNumber', 'serviceAccount', 'storageLocation', 'configuration', 'facet', 'object', 'script', 'template', 'view', 'i18n', 'expression']

class ExportStream extends Transform {

  constructor(options) {
    super(Object.assign({
      objectMode: true
    }, options))
    this.runtimes = []
  }

  checkKeys(name) {
    return KEYS.indexOf(name) > -1 || isCustomName(name)
  }

  _transform(chunk, enc, callback) {
    // Lets push only the allowed keys
    if (!chunk.object) {
      callback(new Fault('kMissingObjectKey', 'There is no object property', 400))
    } else if (chunk.object === 'fault') {
      callback(Fault.from(chunk))
    } else {
      if (this.checkKeys(chunk.object)) {
        const section = new ExportSection(chunk, chunk.object)
        this.push(section)
      } else if (chunk.object === 'stream') {
        const section = new StreamChunk(chunk, chunk.object)
        this.push(section)
      } else if (chunk.object === 'runtime-resource') {
        this.runtimes.push(chunk)
      }
      // ignore unhandled chunks
      callback()
    }

  }

  _flush(done) {
    if (this.runtimes.length) {
      const section = new ExportSection(this.runtimes, 'resources')
      this.push(section)
    }
    done()
  }

}

module.exports = ExportStream
