const { Readable } = require('stream'),
      _ = require('lodash'),
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
      this.push(item.value)
    } else {
      this.push(null)
    }
  }

}

module.exports = ImportStream
