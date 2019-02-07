const { Transform } = require('stream'),
      clone = require('clone'),
      isPlainObject = require('lodash.isplainobject'),
     { rBool, rInt, rString } = require('../utils/values'),
     { sortKeys } = require('../utils')
/**
 * outputs a binary stream from incoming stream of json objects
 */
class InputStream extends Transform {

  /**
   *
   * @param opts
   *   filter: a function that filters json objects.
   *   dataField: defaults to 'data'
   *   indexField: default to 'index'
   */
  constructor(opts = {}) {

    super(opts)

    this._filter = opts.filter || (() => true)
    this._idx = 0
    this._dataField = rString(opts.dataField, 'data')
    this._indexField = rString(opts.indexField, 'index')
    this._writableState.objectMode = true
    this._readableState.objectMode = false

  }

  _transform(object, encoding, callback) {

    let err, buf

    if (object && this._filter(object, this._idx)) {

      const {[this._indexField]: index, [this._dataField]: data } = object

      if (this._idx !== index) {

        err = Fault.create('kInvalidArgument', {reason: `Stream received chunk out of order. Expecting ${this._idx} but got ${index}`})

      } else if (data === null) {

        this.end()

      } else {

        this._idx += 1
        try {
          buf = Buffer.from(data, 'base64')
        } catch(e) {
          err = e
        }
      }

    }

    setImmediate(callback, err, buf)

  }

}

/**
 * outputs a chunked json stream from an input stream.
 */
class OutputStream extends Transform {

  /**
   *
   * @param opts
   *   ndjson: boolean default true. if true, turns off object mode and outputs newline delimited json strings.
   *     if false, turns on object mode and outputs json objects.
   *   chunkSize: 8192. the number of raw bytes in each output chunk. the encoded chunks will be larger.
   *   template. an object template in which the data field is inserted
   *   dataField: defaults to 'data'
   *   indexField: default to 'index'
   *   serialize
   *
   */
  constructor(opts = {}) {

    super(opts)

    this._ndjson = rBool(opts.ndjson, true)
    this._buffer = null
    this._idx = 0
    this._chunkSize = Math.max(1, rInt(opts.chunkSize, 8192))
    this._template = isPlainObject(opts.template) ? clone(opts.template) : {}
    this._dataField = rString(opts.dataField, 'data')
    this._indexField = rString(opts.indexField, 'index')

    this._writableState.objectMode = false
    this._readableState.objectMode = !this._ndjson

  }

  _transform(chunk, encoding, callback) {

    let data = chunk,
        pos = 0

    if (!Buffer.isBuffer(chunk)) {
      data = new Buffer(chunk)
    }
    if (this._buffer) {
      data = Buffer.concat([this._buffer, chunk])
    }

    while (pos + this._chunkSize <= chunk.length) {

      const buf = (data.slice(pos, pos + this._chunkSize))
      this._pushBuffer(buf, this._idx)
      this._idx += 1
      pos += this._chunkSize

    }

    this._buffer = data.slice(pos);
    setImmediate(callback)

  }

  _flush(callback) {

    if (this._buffer && this._buffer.length) {
      this._pushBuffer(this._buffer, this._idx)
      this._idx += 1
      this._buffer = null
    }
    this._pushBuffer(null, this._idx)
    setImmediate(callback)

  }

  _pushBuffer(buf, idx) {

    const obj = sortKeys(Object.assign(clone(this._template), {
        [this._indexField]: idx,
        [this._dataField]: buf ? buf.toString('base64') : null
      }))

    if (this._ndjson) {
      if (idx > 0) {
        this.push('\n')
      }
      this.push(JSON.stringify(obj))
    } else {
      this.push(obj)
    }

  }

}

module.exports = {
  InputStream,
  OutputStream
}
