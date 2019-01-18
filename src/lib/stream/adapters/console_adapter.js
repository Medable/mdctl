const AdapterBase = require('./base')

class ConsoleAdapter extends AdapterBase {

  _write(chunk, encoding, cb) {
    const obj = {}
    this.rollbackScripts(chunk)
    obj[chunk.key] = chunk.content
    console.log(JSON.stringify(obj))
    cb()
  }

}

module.exports = ConsoleAdapter
