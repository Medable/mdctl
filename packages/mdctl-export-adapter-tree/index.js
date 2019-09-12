const { Writable } = require('stream'),
      fs = require('fs'),
      jp = require('jsonpath'),
      _ = require('lodash'),
      globby = require('globby'),
      request = require('request'),
      { Fault } = require('@medable/mdctl-core'),
      { stringifyContent } = require('@medable/mdctl-core-utils/values'),
      { md5FileHash } = require('@medable/mdctl-node-utils/crypto'),
      { ensureDir } = require('@medable/mdctl-node-utils/directory'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      KNOWN_FILES = {
        assets: 'env/**/*.{ico,png,jpeg,jpg,gif,html,txt,bin,js}',
        objects: 'env/**/*.{json,yaml}',
        manifest: '{manifest,exports,dependencies}.{json,yaml}'
      }

class ExportFileTreeAdapter extends Writable {

  constructor(outputPath, options = {}) {
    super({ objectMode: true })
    const { format = 'json', mdctl = null, clearOutput = true } = options,
          output = outputPath || process.cwd(),
          privates = {
            clearOutput,
            format,
            mdctl,
            output,
            cache: `${output}/.cache.json`,
            metadata: {},
            resources: []
          }
    Object.assign(privatesAccessor(this), privates)
    this.loadMetadata()
    this.validateStructure()
  }

  get output() {
    return privatesAccessor(this).output
  }

  get format() {
    return privatesAccessor(this).format
  }

  get cache() {
    return privatesAccessor(this).cache
  }

  get metadata() {
    return privatesAccessor(this).metadata
  }

  get mdctl() {
    return privatesAccessor(this).mdctl
  }

  validateStructure() {
    if (this.metadata) {
      if (this.metadata.format
        && (this.format || (this.mdctl && this.mdctl.format)) !== this.metadata.format) {
        throw new Fault('kMismatchFormatExport',
          'the location contains exported data in different format, you will have duplicated information in different formats')
      }
      if (this.metadata.layout
        && (this.layout || (this.mdctl && this.mdctl.layout)) !== this.metadata.layout) {
        throw new Fault('kMismatchLayoutExport',
          'the location contains exported data in different layout, you will have duplicated information in different layout')
      }
    }
  }

  loadMetadata() {
    const file = this.cache
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file)
      privatesAccessor(this, 'metadata', JSON.parse(content))
    }
  }

  static async downloadResources(url, fileWriter) {
    return new Promise((resolve, reject) => {
      request(url).pipe(fileWriter).on('finish', resolve).on('error', reject)
    })
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

    /* eslint-disable no-restricted-syntax */
    for (const asset of assets) {
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
        asset.data = Buffer.concat(asset.stream.filter(v => v !== null))
      }
    }

    for (const s of sections) {
      ensureDir(s.folder)
      this.writeToFile(s.file, s.data, false)
    }

    for (const r of assets) {
      ensureDir(r.folder)
      if (ExportFileTreeAdapter.fileNeedsUpdate(r, r.file)) {
        if (r.remoteLocation && r.url) {
          // download remote resource
          const fileWriter = fs.createWriteStream(r.file)
          /* eslint-disable no-await-in-loop */
          await ExportFileTreeAdapter.downloadResources(r.url, fileWriter)
        } else if (r.base64) {
          this.writeToFile(r.file, Buffer.from(r.base64, 'base64'), true)
        } else {
          this.writeToFile(r.file, r.data, true)
        }
      }
    }
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

  writeToFile(file, content, plain = false) {
    return fs.writeFileSync(file, !plain ? stringifyContent(content, this.format) : content)
  }

  createCheckpointFile() {
    this.writeToFile(`${this.output}/.cache.json`, JSON.stringify(this.metadata, null, 2), true)
  }

  processChunk(chunk) {
    try {
      if (chunk.key === 'stream') {
        this.writeStreamAsset(chunk)
      } else {
        const folder = `${this.output}/${chunk.getPath()}`
        if (chunk.isFacet) {
          chunk.extractAssets()
          this.writeBinaryFiles(chunk)
        } else {
          // ensureDir(folder)
          chunk.extractScripts()
          chunk.extractTemplates()
          this.writeExtraFiles(folder, chunk)
        }
        if (chunk.isWritable) {
          this.addResource({
            folder,
            id: chunk.id,
            name: chunk.name,
            data: chunk.content,
            dest: `${chunk.name}.${this.format}`
          })
          // remove resource property on save
          delete chunk.content.resource
        }
      }
      return true
    } catch (e) {
      throw e
    }
  }

  async clearOutput() {
    const { clearOutput } = privatesAccessor(this)
    if (clearOutput) {
      const paths = await globby([
        `${this.output}/${KNOWN_FILES.manifest}`,
        `${this.output}/${KNOWN_FILES.objects}`,
        `${this.output}/${KNOWN_FILES.assets}`
      ])
      const promises = []
      paths.forEach((p) => {
        promises.push(new Promise((resolve, reject) => {
          fs.unlink(p, err => {
            if(err) return reject(err)
            return resolve()
          })
        }))
      })
      return Promise.all(promises)
    }
    return Promise.resolve()
  }

  _write(chunk, enc, cb) {
    this.processChunk(chunk)
    cb()
  }

  async _final(cb) {
    const { resources } = privatesAccessor(this)
    if(resources.length) {
      await this.clearOutput()
      await this.writeAndUpdatePaths()
      this.createCheckpointFile()
    }
    cb()
  }

}

module.exports = ExportFileTreeAdapter
