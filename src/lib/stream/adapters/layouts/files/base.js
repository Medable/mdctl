const { Writable } = require('stream'),
      request = require('request'),
      fs = require('fs'),
      jp = require('jsonpath'),
      _ = require('lodash'),
      { privatesAccessor } = require('../../../../privates'),
      { ensureDir } = require('../../../../utils/directory'),
      { md5FileHash } = require('../../../../utils/crypto')

class Layout extends Writable {

  constructor(output, { format = 'json', metadata = {} }) {
    super({ objectMode: true, end: false })
    Object.assign(privatesAccessor(this), {
      output,
      format,
      metadata,
      resources: [],
      streams: {}
    })
    ensureDir(output)
  }

  get format() {
    return privatesAccessor(this).format
  }

  get metadata() {
    return privatesAccessor(this).metadata
  }

  get output() {
    return privatesAccessor(this).output
  }

  static downloadResources(url) {
    return request(url)
  }

  static fileNeedsUpdate(f, pathFile) {
    if (f.ETag && fs.existsSync(pathFile)) {
      return md5FileHash(pathFile) !== f.ETag
    }
    return true
  }

  addResource(f) {
    privatesAccessor(this).resources.push(f)
  }

  async writeAndUpdatePaths() {
    const { resources } = privatesAccessor(this)

    _.forEach(resources, (r) => {
      const isAsset = ['assets', 'tpl', 'js'].indexOf(r.type) > -1,
            dest = r.dest || `${r.name}.${r.ext}`
      /* eslint-disable no-param-reassign */
      r.isAsset = isAsset
      if (!isAsset) {
        ensureDir(r.folder)
        r.file = `${r.folder}/${dest}`
      } else {
        const section = _.find(resources, doc => doc.id === r.sectionId)
        ensureDir(`${section.folder}/${r.type}`)
        r.file = `${section.folder}/${r.type}/${dest}`
        jp.value(section.data, r.pathTo, r.file.replace(this.output, ''))
        if (r.PathETag) {
          jp.value(section.data, r.PathETag, r.ETag)
        }
        if (r.stream && r.stream.length) {
          r.data = r.stream.join()
        }
      }
    })

    _.forEach(resources, (r) => {
      if (r.isAsset) {
        if (Layout.fileNeedsUpdate(r, r.file)) {
          if (r.remoteLocation && r.url) {
            // download remote resource
            fs.createReadStream(r.file).pipe(Layout.downloadResources(r.url))
          } else if (r.base64) {
            this.writeToFile(r.file, Buffer.from(r.base64, 'base64'), true)
          } else {
            this.writeToFile(r.file, r.data, true)
          }
        }
      } else {
        this.writeToFile(r.file, r.data, false)
      }
    })
  }

  async writeStreamAsset(chunk) {
    const { resources } = privatesAccessor(this),
          existingStream = _.find(resources, r => r.streamId === chunk.content.streamId)
    if (existingStream) {
      if (!existingStream.stream) {
        existingStream.stream = []
      }
      if (chunk.content.data !== null) {
        existingStream.stream.push(Buffer.from(chunk.content.data, 'base64'))
      } else {
        existingStream.stream.push(null)
      }
      privatesAccessor(this, 'resources', resources)
    }
  }

  async writeBinaryFiles(chunk) {
    _.forEach(chunk.extraFiles, (ef) => {
      const file = Object.assign(ef, { type: 'assets' })
      this.addResource(file)
    })
  }

  async writeExtraFiles(folder, chunk) {
    _.forEach(chunk.scriptFiles, sf => this.addResource(Object.assign(sf, { type: 'js' })))
    _.forEach(chunk.templateFiles, tf => this.addResource(Object.assign(tf, { type: 'tpl' })))
  }

}

module.exports = Layout
