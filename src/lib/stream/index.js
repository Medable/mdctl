const { Transform, Readable } = require('stream'),
      { ExportSection, StreamChunk } = require('./section'),
      Fault = require('../fault'),
      { isCustomName } = require('../utils/values'),
      KEYS = ['manifest', 'manifest-dependencies', 'manifest-exports', 'env', 'app', 'config', 'notification', 'policy', 'role', 'smsNumber', 'serviceAccount', 'storageLocation', 'configuration', 'facet', 'object', 'script', 'template', 'view'],
      { privatesAccessor } = require('../privates'),
      { ImportFileAdapter } = require('./adapters/file_adapter')

class ExportStream extends Transform {

  constructor(options) {
    super(Object.assign({
      objectMode: true
    }, options))
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
      }
      // ignore unhandled chunks
      callback()
    }

  }

  _flush(done) {
    done()
  }

}

class ImportStream extends Readable {

  constructor(inputDir, format = 'json') {
    super({ objectMode: true })
    Object.assign(privatesAccessor(this), {
      input: inputDir || process.cwd(),
      cache: `${inputDir || process.cwd()}/.cache.json`,
      format,
      adapter: null
    })
    this.loadIterator()
    this.docProcessed = false
    this.items = []
  }

  loadIterator() {
    const { input, cache, format } = privatesAccessor(this),
          importAdapter = new ImportFileAdapter(input, cache, format)

    privatesAccessor(this, 'adapter', importAdapter)
  }


  async _read(size) {
    const { adapter } = privatesAccessor(this)
    if (!this.docProcessed) {
      const iter = adapter.iterator[Symbol.asyncIterator](),
            item = await iter.next()
      if (!item.done) {
        return item.value.forEach((v) => {
          this.items.push(v)
          this.push(v)
        })
      }
      this.docProcessed = true
    }
    return adapter.getBlobs((err, data) => {
      if(!err) {
        if(data) {
          this.push(data)
        } else{
          this.push(null)
        }
      }
    })
  }

}

module.exports = {
  ExportStream,
  ImportStream
}
