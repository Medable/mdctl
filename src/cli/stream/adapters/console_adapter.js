const jsyaml = require('js-yaml'),
      Stream = require('../index'),
      Section = require('./sections'),
      KEYS = ['env', 'objects', 'scripts', 'templates', 'views']

const layout = Stream.output.CONSOLE

class ConsoleAdapter {

  constructor(blob, options, emitter) {
    this.options = options
    this.blob = blob
    this.source = {}
    this.emitter = emitter
  }

  async save() {
    const blobKeys = Object.keys(this.blob)
    blobKeys.forEach((k) => {
      if (KEYS.indexOf(k) > -1) {
        this.source[k] = Section.getSection(k, this.blob[k], this.options)
      }
    })
    const result = await this.processFiles()
    return result
  }

  processFiles() {
    console.log(JSON.stringify(this.source))
  }

}

module.exports = {
  adapter: ConsoleAdapter,
  layout
}
