/* eslint-disable no-underscore-dangle */
const { Writable } = require('stream'),
      { stringifyContent } = require('@medable/mdctl-core-utils/values'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates')

class ExportConsoleAdapter extends Writable {

  constructor(options = {}) {
    super({ objectMode: true })
    const { format = 'json', print = true } = options,
          privates = {
            format,
            print,
            items: []
          }
    Object.assign(privatesAccessor(this), privates)
  }

  get format() {
    return privatesAccessor(this).format
  }

  get items() {
    return privatesAccessor(this).items
  }

  add(content) {
    privatesAccessor(this).items.push(content)
  }

  _write(chunk, enc, cb) {
    if (privatesAccessor(this).print) {
      console.log(stringifyContent(chunk, this.format))
    }
    this.add(stringifyContent(chunk, this.format))
    cb()
  }

  _final(cb) {
    cb()
  }

}

module.exports = ExportConsoleAdapter
