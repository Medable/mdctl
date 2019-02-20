const { Writable } = require('stream'),
      request = require('request'),
      fs = require('fs'),
      jp = require('jsonpath'),
      _ = require('lodash'),
      { privatesAccessor } = require('../../../../privates'),
      { ensureDir } = require('../../../../utils/directory'),
      { md5FileHash } = require('../../../../utils/crypto'),
      Fault = require('../../../../fault')

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
    const { resources } = privatesAccessor(this),
          sections = _.map(_.filter(resources, res => !res.sectionId), (s) => {
            const dest = s.dest || `${s.name}.${s.ext}`
            return Object.assign(s, { file: `${s.folder}/${dest}` })
          }),
          assets = _.filter(resources, res => res.sectionId)

    _.forEach(assets, (asset) => {
      const dest = asset.dest || `${asset.name}.${asset.ext}`,
            section = _.find(sections, doc => doc.id === asset.sectionId || doc.name === `${asset.sectionName}`)
      if (section) {
        /* eslint-disable no-param-reassign */
        asset.folder = `${section.folder}/${asset.type}`
        asset.file = `${section.folder}/${asset.type}/${dest}`
        jp.value(section.data, asset.pathTo, asset.file.replace(this.output, ''))
        if (asset.PathETag) {
          jp.value(section.data, asset.PathETag, asset.ETag)
        }
      } else {
        throw Fault.create('kSectionNotFound', {
          reason: `We coudn't find any section matching to update file path: Id: ${asset.sectionId}, name: ${asset.sectionName}`
        })
      }
      if (asset.stream && asset.stream.length) {
        /* eslint-disable no-param-reassign */
        asset.data = asset.stream.join()
      }
    })

    _.forEach(sections, (s) => {
      ensureDir(s.folder)
      this.writeToFile(s.file, s.data, false)
    })
    _.forEach(assets, (r) => {
      ensureDir(r.folder)
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
