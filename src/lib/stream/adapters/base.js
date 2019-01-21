const { Duplex } = require('stream'),
      jp = require('jsonpath')

class AdapterBase extends Duplex {

  constructor(options) {
    super(Object.assign({
      objectMode: true
    }, options))
  }

  rollbackScripts(chunk) {
    if (chunk.jsInScript) {
      const scripts = Object.keys(chunk.jsInScript)
      scripts.forEach((js) => {
        jp.value(chunk.content, js, chunk.jsInScript[js].value)
      })
      chunk.clearScripts()
    }
  }

  _read() {}

  _write() {}

}

module.exports = AdapterBase
