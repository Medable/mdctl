const { Duplex } = require('stream')

class MemoryAdapter extends Duplex {

  constructor(options) {
    super(Object.assign({
      objectMode: true
    }, options))
  }

  _write(chunk, encoding, cb) {
    this.push({ [chunk.key]: chunk.content })
    cb()
  }

  _read() {}
}

module.exports = MemoryAdapter
