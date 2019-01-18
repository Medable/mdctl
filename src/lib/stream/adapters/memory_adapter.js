const AdapterBase = require('./base')


class MemoryAdapter extends AdapterBase {

  _write(chunk, encoding, cb) {
    this.rollbackScripts(chunk)
    this.push({ [chunk.key]: chunk.content })
    cb()
  }

  _read() {}

}

module.exports = MemoryAdapter
