const { Readable } = require('stream'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      ImportFileTreeAdapter = require('@medable/mdctl-import-adapter')

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
      const value = await Promise.resolve(item.value)
      if (value instanceof Array) {
        value.forEach(d => this.push(d))
      } else {
        this.push(value)
      }
    } else {
      this.push(null)
    }
  }

}

module.exports = ImportStream
