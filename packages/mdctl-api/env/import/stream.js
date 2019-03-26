const { Readable } = require('stream'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      ImportFileTreeAdapter = require('@medable/mdctl-import-adapter'),
      { OutputStream } = require('@medable/mdctl-core/streams/chunk-stream')


class ImportStream extends Readable {

  constructor(inputDir, format = 'json') {
    super({ objectMode: true })
    Object.assign(privatesAccessor(this), {
      input: inputDir || process.cwd(),
      cache: `${inputDir || process.cwd()}/.cache.json`,
      format,
      adapter: null,
      docProcessed: false
    })
    this.loadAdapter()
  }

  loadAdapter() {
    const { input, cache, format } = privatesAccessor(this),
          importAdapter = new ImportFileTreeAdapter(input, cache, format)
    privatesAccessor(this, 'adapter', importAdapter)
  }

  async _read() {
    const { adapter } = privatesAccessor(this),
          iter = adapter.iterator[Symbol.asyncIterator](),
          item = await iter.next()
    if (!item.done) {
      if (item.value instanceof OutputStream) {
        this.pause()
        return new Promise((resolve) => {
          item.value.on('data', (d) => {
            this.push(d)
          }).on('finish', () => {
            if (this.isPaused()) {
              this.resume()
              resolve()
            }
          })
        })
      }
      return this.push(item.value)
    }
    if (this.isPaused()) {
      this.resume()
    }
    return this.push(null)

  }

}

module.exports = ImportStream
