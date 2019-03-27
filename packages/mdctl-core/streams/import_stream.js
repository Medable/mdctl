const { Readable } = require('stream'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      Fault = require('../fault')

class ImportStream extends Readable {

  constructor(adapter) {
    super({ objectMode: true })
    if (!adapter) {
      throw Fault.from({ code: 'kMissingAdapter', reason: 'Missing import adapter' })
    }
    Object.assign(privatesAccessor(this), {
      adapter
    })
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
