const { PassThrough, Transform } = require('stream'),
      JSONStream = require('JSONStream'),
      Section = require('./adapters/sections'),
      KEYS = ['env', 'objects', 'scripts', 'templates', 'views']

class StreamTransform extends Transform {
  constructor(options) {
    super(Object.assign({
      objectMode: true
    }, options))
  }

  _transform(chunk, enc, done) {
    if(KEYS.indexOf(chunk.key) > -1) {
      this.push(new Section(chunk.key, chunk.value))
    }
    done()

  }
}

class StreamBlob extends PassThrough {

  constructor(options) {
    super(Object.assign({
      objectMode: true
    }, options))

    this.on('pipe', (source) => {
      source.unpipe(this)
      this.transformStream = source.pipe(JSONStream.parse('$*')).pipe(new StreamTransform(options))
    })
  }

  pipe(dest, options) {
    return this.transformStream.pipe(dest, options)
  }

}


module.exports = StreamBlob
