const { Transform } = require('stream')

class StreamConcat extends Transform {

  constructor(streams, options = {}) {
    super(options)
    this.streams = streams
    this.currentNb = 0
    this.loop()
  }

  // eslint-disable-next-line no-underscore-dangle
  _transform(chunk, enc, done) {
    if (chunk) {
      this.push(chunk)
    }
    done()
  }

  loop() {
    if (this.currentNb < this.streams.length) {
      const currentStream = this.streams[this.currentNb]
      currentStream.once('error', (err) => {
        this.emit('error', err)
      })
      currentStream.pipe(this, { end: false })
      currentStream.on('end', () => {
        this.loop()
      })
      this.currentNb += 1
    } else {
      this.push(null)
      this.currentNb = 0
    }

  }

}

module.exports = StreamConcat
