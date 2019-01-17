const { Duplex } = require('stream'),
      jp = require('jsonpath')

class Adapter extends Duplex {

  constructor(options) {
    super(Object.assign({
      objectMode: true
    }, options))
  }

  rollbackScripts(chunk) {
    if (chunk.jsInScript) {
      for (const js in chunk.jsInScript) {
        jp.value(chunk.content, js, chunk.jsInScript[js].value)
      }
      chunk.clearScripts()
    }
  }

}

module.exports = Adapter
