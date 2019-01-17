const { Writable } = require('stream')

class ConsoleAdapter extends Writable {

  constructor(options) {
    super(Object.assign({
      objectMode: true
    }, options))
  }

  _write(chunk, encoding, cb){
    const obj = {}
    console.log(JSON.stringify(chunk))
    cb()
  }

}

module.exports = ConsoleAdapter
