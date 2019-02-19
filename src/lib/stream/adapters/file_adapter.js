const { Writable, Transform } = require('stream'),
      EventEmitter = require('events'),
      mime = require('mime-types'),
      fs = require('fs'),
      jp = require('jsonpath'),
      _ = require('lodash'),
      request = require('request'),
      slugify = require('slugify'),
      pluralize = require('pluralize'),
      { md5FileHash } = require('../../utils/crypto'),
      Fault = require('../../fault'),
      { ImportSection } = require('../section'),
      { stringifyContent, parseString } = require('../../utils/values'),
      { ensureDir } = require('../../utils/directory'),
      { privatesAccessor } = require('../../privates'),
      { OutputStream } = require('../chunk-stream')

class Layout extends Writable {

  constructor(output, { format = 'json', metadata = {} }) {
    super({ objectMode: true, end: false})
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
      if(r.isAsset) {
        if (Layout.fileNeedsUpdate(r, r.file)) {
          if(r.remoteLocation && r.url) {
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

class FilesLayout extends Layout {

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
            data: chunk.content,
            dest: `${slugify(chunk.name, '_')}.${this.format}`
          })
        }
      }
      return true
    } catch (e) {
      throw e
    }
  }

  _write(chunk, enc, cb) {
    this.processChunk(chunk)
    cb()
  }

  _final(cb) {
    this.writeAndUpdatePaths()
    this.createCheckpointFile()
    cb()
  }

}

class ExportFileAdapter extends EventEmitter {

  constructor(outputPath, options = {}) {
    super()
    const { format = 'json', mdctl = null } = options,
          output = outputPath || process.cwd(),
          privates = {
            format,
            mdctl,
            output,
            cache: `${output}/.cache.json`,
            metadata: {}
          }
    Object.assign(privatesAccessor(this), privates)
    this.loadMetadata()
    this.validateStructure()
    return new FilesLayout(privates.output, privates)
  }

  get format() {
    return privatesAccessor(this).format
  }

  get layout() {
    return privatesAccessor(this).layout
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

}

class FileTransformStream extends Transform {

  constructor(metadata, file, basePath = process.cwd()) {
    super({ objectMode: true })
    Object.assign(privatesAccessor(this), {
      metadata,
      mime: mime.lookup(file),
      file,
      basePath
    })
  }

  get metadata() {
    return privatesAccessor(this).metadata
  }

  _transform(chunk, enc, callback) {
    const { metadata, basePath, file } = privatesAccessor(this),
          content = parseString(chunk, metadata.format)
    this.push(new ImportSection(content, content.object, file, basePath))
    callback()
  }

}

class ImportFileAdapter extends EventEmitter {

  constructor(inputDir, cache, format) {
    super()
    Object.assign(privatesAccessor(this), {
      files: [],
      input: inputDir || process.cwd(),
      cache: cache || `${inputDir || process.cwd()}/.cache.json`,
      format: format || 'json',
      metadata: {},
      blobs: [],
      index: 0,
      blobIndex: 0
    })

    this.loadMetadata()
    this.walkFiles(privatesAccessor(this).input)
  }

  get files() {
    return privatesAccessor(this).files
  }

  get metadata() {
    return privatesAccessor(this).metadata
  }

  getAssetStream(ef) {
    const { metadata } = privatesAccessor(this),
          outS = new OutputStream({
            ndjson: false,
            template: ef
          })
    outS.write(stringifyContent(ef, metadata.format))
    outS.end()
    return outS
  }

  get iterator() {
    const self = this
    return {
      [Symbol.asyncIterator]() {
        return {
          next: async() => self.getChunks()
        }
      }
    }
  }


  get blobs() {
    return privatesAccessor(this).blobs
  }

  async getChunks() {
    const { files, index } = privatesAccessor(this),
          result = {
            done: false,
            value: []
          }
    let { blobs } = privatesAccessor(this)
    if (files.length > index) {
      // Increment index processing
      privatesAccessor(this, 'index', index + 1)

      const f = files[index],
            section = await this.loadFile(f)

      await section.loadFacets()
      await section.loadScripts()
      await section.loadTemplates()
      result.value.push(section.content)

      if (section && section.facets && section.facets.length) {
        result.value = _.concat(
          result.value,
          section.facets
        )
        if (section.extraFiles && section.extraFiles.length) {
          blobs = _.concat(blobs, section.extraFiles)
        }
        privatesAccessor(this, 'blobs', blobs)
      }

      return result

    }
    return {
      value: null,
      done: true
    }
  }

  walkFiles(dir) {
    const files = fs.readdirSync(dir)
    files.forEach((f) => {
      if (f.indexOf('.') !== 0) {
        const pathFile = `${dir}/${f}`
        if (fs.statSync(pathFile).isDirectory()) {
          this.walkFiles(pathFile)
        } else {
          const type = mime.lookup(pathFile)
          if (type === 'application/json' || ['text/yaml', 'application/yaml'].indexOf(type) > -1) {
            privatesAccessor(this, 'files').push(pathFile)
          }
        }
      }
    })
  }

  loadFile(file) {
    const {
      input, metadata
    } = privatesAccessor(this)
    return new Promise((resolve, reject) => {
      const contents = []
      fs.createReadStream(file).pipe(new FileTransformStream(metadata, file, input))
        .on('data', (chunk) => {
          contents.push(chunk)
        })
        .on('error', (e) => {
          reject(e)
        })
        .on('end', () => {
          resolve(contents[0])
        })
    })
  }

  loadMetadata() {
    const { cache, format } = privatesAccessor(this)
    if (fs.existsSync(cache)) {
      const content = fs.readFileSync(cache),
            metadata = JSON.parse(content.toString())
      metadata.format = format
      privatesAccessor(this, 'metadata', metadata)
    }
  }

}

class ManifestFileAdapter {

  static async addResource(output, format, type, template) {
    const out = `${output}/env/${pluralize(type)}`,
          object = template.getBoilerplate()
    ensureDir(out)
    if (type === 'script') {
      const filePath = `${out}/js/${template.exportKey}.js`
      ensureDir(`${out}/js`)
      fs.writeFileSync(filePath, 'return true;')
      object.script = filePath.replace(out, '')
    }
    if (type === 'template') {
      /* eslint no-param-reassign: "error" */
      ensureDir(`${out}/tpl`)
      _.forEach(object.localizations, (loc) => {
        _.forEach(loc.content, (cnt) => {
          let ext = ''
          switch (cnt.name) {
            case 'html':
              ext = 'html'
              break
            default:
              ext = 'txt'
          }
          const file = `${out}/tpl/${template.exportKey}.${cnt.name}.${ext}`
          fs.writeFileSync(file, cnt.data)
          cnt.data = file.replace(out, '')
        })
      })
    }
    fs.writeFileSync(`${out}/${template.exportKey}.${format}`, stringifyContent(object, format))
  }

  static async saveManifest(output, format = 'json', content = {}) {
    content.object = 'manifest'
    const out = `${output}/manifest.${format}`
    fs.writeFileSync(out, stringifyContent(content, format))
  }

}

module.exports = {
  ExportFileAdapter,
  ImportFileAdapter,
  ManifestFileAdapter
}
