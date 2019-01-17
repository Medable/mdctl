const Adapter = require('./adapter')


class MemoryAdapter extends Adapter {

  _write(chunk, encoding, cb) {
    this.rollbackScripts(chunk)
    this.push({ [chunk.key]: chunk.content })
    cb()
  }

  _read() {}

}

module.exports = MemoryAdapter
