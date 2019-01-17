const Adapter = require('./adapter')

class ConsoleAdapter extends Adapter {

  _write(chunk, encoding, cb) {
    const obj = {}
    this.rollbackScripts(chunk)
    console.log(JSON.stringify(chunk))
    cb()
  }

}

module.exports = ConsoleAdapter
