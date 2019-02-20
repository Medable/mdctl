const { Writable } = require('stream'),
      { privatesAccessor } = require('../../privates'),
      { stringifyContent } = require('../../utils/values')

class ExportConsoleAdapter extends Writable {

  constructor(outputPath, options = {}) {
    super()
    const { format = 'json' } = options,
          privates = {
            format
          }
    Object.assign(privatesAccessor(this), privates)
  }

  get format() {
    return privatesAccessor(this).format
  }

  _write(chunk, enc, cb) {
    console.log(stringifyContent(chunk, this.format))
    cb()
  }

}

module.exports = ExportConsoleAdapter
