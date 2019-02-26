const { Transform, Readable } = require('stream'),
      { ExportSection, StreamChunk } = require('./section'),
      Fault = require('../fault'),
      { isCustomName } = require('mdctl-core-utils/values'),
      KEYS = ['manifest', 'manifest-dependencies', 'manifest-exports', 'env', 'app', 'config', 'notification', 'policy', 'role', 'smsNumber', 'serviceAccount', 'storageLocation', 'configuration', 'facet', 'object', 'script', 'template', 'view'],
      { privatesAccessor } = require('mdctl-core-utils/privates')

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

  constructor(inputDir, adapter = null, format = 'json') {
    super({ objectMode: true })
    Object.assign(privatesAccessor(this), {
      input: inputDir || process.cwd(),
      cache: `${inputDir || process.cwd()}/.cache.json`,
      format,
      adapter,
      docProcessed: false
    })
    this.loadAdapter()
  }

  loadAdapter() {
    const { input, cache, format, adapter } = privatesAccessor(this)
    if(!adapter) {
      throw Fault.create({reason: 'No adapter set'})
    }
    const importAdapter = new adapter(input, cache, format)
    privatesAccessor(this, 'adapter', importAdapter)
  }


  async _read() {
    const { adapter, docProcessed } = privatesAccessor(this)
    if (!docProcessed) {
      const iter = adapter.iterator[Symbol.asyncIterator](),
            item = await iter.next()
      if (!item.done) {
        return item.value.forEach((v) => {
          this.push(v)
        })
      }
      privatesAccessor(this, 'docProcessed', true)
    } else {
      const { blobs } = adapter
      if (blobs.length) {
        blobs.forEach((b) => {
          adapter.getAssetStream(b).on('data', (d) => {
            this.push(d)
          }).on('end', () => {
            this.push(null)
          })
          blobs.pop()
        })
      }
    }
    return true
  }

}

module.exports = {
  ExportStream,
  ImportStream
}
