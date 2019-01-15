const jsyaml = require('js-yaml'),
      process = require('process'),
      EVENT_NAMES = require('./event_names'),
      BaseAdapter = require('./base'),
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

class FileAdapter extends BaseAdapter {

  constructor(options) {
    super()
    this.layout = 'file'
    this.options = Object.assign({
      layout: 'file',
      outputDir: `${process.cwd()}/output`
    }, options)
    this.source = []
    this.startListeners()
  }

  startListeners() {
    this.on(EVENT_NAMES.SAVE_TO_FILE, (data) => {
      if (data.layout === this.layout) {
        this.saveToFile(data.blob, data.format)
      }
    })
  }

  static getFormatClass(format) {
    switch (format) {
      case 'yaml':
        return new YAMLFile()
      default:
        return new JSONFile()
    }
  }

  async saveToFile(blob, format = 'json') {
    const blobKeys = Object.keys(blob)
    blobKeys.forEach((k) => {
      if (KEYS.indexOf(k) > -1) {
        this.source.push(Section.getSection(k, blob[k], this.options))
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

module.exports = FileAdapter
