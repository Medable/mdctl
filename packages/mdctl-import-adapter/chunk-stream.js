const { Transform } = require('stream'),
      clone = require('clone'),
      isPlainObject = require('lodash.isplainobject'),
      { rBool, rInt, rString } = require('@medable/mdctl-core-utils/values'),
      { sortKeys } = require('@medable/mdctl-core-utils'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      { Fault } = require('@medable/mdctl-core')

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

    Object.assign(privatesAccessor(this), {
      filter: opts.filter || (() => true),
      idx: 0,
      dataField: rString(opts.dataField, 'data'),
      indexField: rString(opts.indexField, 'index')
    })

    // eslint-disable-next-line no-underscore-dangle
    this._writableState.objectMode = true

    // eslint-disable-next-line no-underscore-dangle
    this._readableState.objectMode = false

  }

  _transform(object, encoding, callback) {

    const privates = privatesAccessor(this)

    let err,
        buf

    if (object && privates.filter(object, privates.idx)) {

      const { [privates.indexField]: index, [privates.dataField]: data } = object

      if (privates.idx !== index) {

        err = Fault.create('kInvalidArgument', { reason: `Stream received chunk out of order. Expecting ${privates.idx} but got ${index}` })

      } else if (data === null) {

        this.end()

      } else {

        privates.idx += 1
        try {
          buf = Buffer.from(data, 'base64')
        } catch (e) {
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
   *   ndjson: boolean default true. if true, turns off object mode and outputs
   *     newline delimited json strings. if false, turns on object mode and outputs json objects.
   *   chunkSize: 8192. the number of raw bytes in each output chunk.
   *     the encoded chunks will be larger.
   *   template. an object template in which the data field is inserted
   *   dataField: defaults to 'data'
   *   indexField: default to 'index'
   *   serialize
   *
   */
  constructor(opts = {}) {

    super(opts)

    const privates = privatesAccessor(this)

    Object.assign(privates, {
      ndjson: rBool(opts.ndjson, true),
      buffer: null,
      chunkSize: Math.max(1, rInt(opts.chunkSize, 8192)),
      template: isPlainObject(opts.template) ? clone(opts.template) : {},
      idx: 0,
      dataField: rString(opts.dataField, 'data'),
      indexField: rString(opts.indexField, 'index'),
      objectMode: rBool(opts.objectMode, false),
      pushBuffer: (buf, idx) => {

        const obj = sortKeys(Object.assign(clone(privates.template), {
          [privates.indexField]: idx,
          [privates.dataField]: buf ? buf.toString('base64') : null
        }))

        if (privates.ndjson) {
          if (idx > 0) {
            this.push('\n')
          }
          this.push(JSON.stringify(obj))
        } else {
          this.push(obj)
        }

      }

    })

    // eslint-disable-next-line no-underscore-dangle
    this._writableState.objectMode = privatesAccessor(this).objectMode

    // eslint-disable-next-line no-underscore-dangle
    this._readableState.objectMode = !privatesAccessor(this).ndjson

  }

  _transform(chunk, encoding, callback) {

    const privates = privatesAccessor(this)

    let data = chunk,
        pos = 0

    if (!Buffer.isBuffer(chunk)) {
      data = Buffer.from(chunk)
    }
    if (privates.buffer) {
      data = Buffer.concat([privates.buffer, chunk])
    }

    while (pos + privates.chunkSize <= chunk.length) {

      const buf = (data.slice(pos, pos + privates.chunkSize))
      privates.pushBuffer(buf, privates.idx)
      privates.idx += 1
      pos += privates.chunkSize

    }

    privates.buffer = data.slice(pos)
    setImmediate(callback)

  }

  _flush(callback) {

    const privates = privatesAccessor(this)

    if (privates.buffer && privates.buffer.length) {
      privates.pushBuffer(privates.buffer, privates.idx)
      privates.idx += 1
      privates.buffer = null
    }
    privates.pushBuffer(null, privates.idx)
    setImmediate(callback)

  }

}

module.exports = {
  InputStream,
  OutputStream
}
