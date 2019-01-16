const { Writable } = require('stream')

class ConsoleAdapter extends Writable {

  constructor(options) {
    super(Object.assign({
      objectMode: true
    }, options))
  }

  _write(chunk, encoding, cb){
    const obj = {}
    obj[chunk.key] = chunk.blob
    console.log(JSON.stringify(obj))
    cb()
  }

}

module.exports = ConsoleAdapter
