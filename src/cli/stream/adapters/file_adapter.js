const jsyaml = require('js-yaml'),
      process = require('process'),
      Stream = require('../index'),
      Section = require('./sections'),
      KEYS = ['env', 'objects', 'scripts', 'templates', 'views']

class JSONFile {

  constructor(blob) {
    this.blob = blob
  }

  stringify(blob = null) {
    return JSON.stringify(blob || this.blob || {})
  }

}

class YAMLFile {

  constructor(blob) {
    this.blob = blob
  }

  stringify(blob = null) {
    return jsyaml.safeDump(blob || this.blob || {})
  }

}

const layout = Stream.output.FILE

class FileAdapter {

  constructor(blob, options, emitter) {
    this.options = Object.assign({
      outputDir: `${process.cwd()}/output`
    }, options)
    this.blob = blob
    this.source = []
    this.emitter = emitter
  }

  static getFormatClass(format) {
    switch (format) {
      case 'yaml':
        return new YAMLFile()
      default:
        return new JSONFile()
    }
  }

  async save(format = 'json') {
    const blobKeys = Object.keys(this.blob)
    blobKeys.forEach((k) => {
      if (KEYS.indexOf(k) > -1) {
        this.source.push(Section.getSection(k, this.blob[k], this.options))
      }
    })
    await this.processFiles(format)
  }

  processFiles(format) {
    for (const section of this.source) {
      section.save(format, FileAdapter.getFormatClass(format))
    }
  }

}

module.exports = {
  adapter: FileAdapter,
  layout
}
