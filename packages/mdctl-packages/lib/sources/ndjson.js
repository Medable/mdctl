const { fs } = require('memfs'),
      pump = require('pump'),
      ndjson = require('ndjson'),
      ExportAdapterTree = require('@medable/mdctl-export-adapter-tree'),
      ExportStream = require('@medable/mdctl-core/streams/export_stream'),
      { privatesAccessor } = require("@medable/mdctl-core-utils/privates"),
      Source = require('./source'),
      ZipTree = require('../zip_tree')


class NdJsonSource extends Source {

  constructor(name, path, options = { ndjsonStream: null }) {
    if(!options.ndjsonStream) {
      throw Error('NdJson stream is needed')
    }
    super(name, path, { fs })
    Object.assign(privatesAccessor(this), {
      stream: options.ndjsonStream
    })

  }

  async getStream() {
    const { stream } = privatesAccessor(this),
          ndjsonStream = ndjson.parse(),
          exportAdapter = new ExportAdapterTree(`/${this.name}`, { clearOutput: false, fs }),
          exportStream = new ExportStream()
    return new Promise((resolve, reject) => {
      pump(stream, ndjsonStream, exportStream, exportAdapter, (err) => {
          if(err) {
            return reject(err)
          }
        const zip = new ZipTree(`/${this.name}`, { fs })
        return resolve(zip.compress())
      })
    })


  }

}

module.exports = NdJsonSource
