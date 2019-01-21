const { PassThrough, Transform } = require('stream'),
      JSONStream = require('JSONStream'),
      Section = require('./section_factory'),
      Fault = require('../fault'),
      KEYS = ['env', 'objects', 'scripts', 'templates', 'views']

class StreamTransform extends Transform {

  constructor(options) {
    super(Object.assign({
      objectMode: true
    }, options))
    this.sections = {}
  }

  validateSections() {
    const sectionKeys = Object.keys(this.sections)
    if (sectionKeys.length < 5) {
      throw new Fault('fkInvalidBlob', `There are missing keys, it should have ${KEYS.toString()} and found only, ${Object.keys(this.sections).toString()}`, 400)
    }
    sectionKeys.forEach((k) => {
      if (!this.sections[k].validate()) {
        throw new Fault('fkInvalidBlob', `The section ${k} is no properly formed`, 400)
      }
    })
  }

  _transform(chunk, enc, done) {
    // Lets push only the allowed keys
    if (KEYS.indexOf(chunk.key) > -1) {
      const section = new Section(chunk.key, chunk.value)
      this.push(section)
      this.sections[chunk.key] = section
    }
    done()

  }

  _flush(done) {
    try {
      this.validateSections()
      done()
    } catch (e) {
      done(e)
    }
  }

}

class StreamBlob extends PassThrough {

  constructor(options) {
    super(Object.assign({
      objectMode: true
    }, options))

    this.jsonStream = JSONStream.parse('$*')
    this.streamTransform = new StreamTransform(options)

    this.jsonStream.on('error', e => this.emit('error', e))
    this.streamTransform.on('error', e => this.emit('error', e))

    this.on('pipe', (source) => {
      source.unpipe(this)
      this.transformStream = source.pipe(this.jsonStream).pipe(this.streamTransform)
    })
  }

  pipe(dest, options) {
    return this.transformStream.pipe(dest, options)
  }

}


module.exports = StreamBlob
