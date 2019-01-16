const { Writable } = require('stream'),
      ConsoleAdapter = require('./console_adapter')

class MemoryAdapter extends ConsoleAdapter {

  _write(chunk, encoding, cb) {
    this.push({ [chunk.key]: chunk.blob })
    cb()
  }

}

module.exports = ConsoleAdapter
