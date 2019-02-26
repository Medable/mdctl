const { Readable } = require('stream'),
      { privatesAccessor } = require('mdctl-core-utils/privates'),
      ImportFileTreeAdapter = require('mdctl-import-adapter')


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

module.exports = ImportStream