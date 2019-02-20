const { Writable, Transform } = require('stream'),
      EventEmitter = require('events'),
      mime = require('mime-types'),
      fs = require('fs'),
      jp = require('jsonpath'),
      _ = require('lodash'),
      request = require('request'),
      slugify = require('slugify'),
      pluralize = require('pluralize'),
      { pathTo } = require('../../utils'),
      { md5FileHash } = require('../../utils/crypto'),
      Fault = require('../../fault'),
      { TemplatesExt, ImportSection } = require('../section'),
      { stringifyContent, parseString } = require('../../utils/values'),
      { ensureDir } = require('../../utils/directory'),
      { privatesAccessor } = require('../../privates'),
      { OutputStream } = require('../chunk-stream')

class Layout extends Writable {

  constructor(output, { format = 'json', metadata = {} }) {
    super({ objectMode: true })
    Object.assign(privatesAccessor(this), {
      output,
      format,
      metadata
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

  static fileNeedsUpdate(f, path) {
    if (f.ETag && fs.existsSync(path)) {
      return md5FileHash(path) !== f.ETag
    }
    return true
  }

  async writeAssets(path, files, notDownload = false) {
    const promises = []
    _.forEach(files, (f) => {
      promises.push(new Promise((resolve, reject) => {
        const dest = `${path}/${slugify(f.name)}.${f.ext}`
        if (!notDownload && Layout.fileNeedsUpdate(f, dest)) {
          const fileWriter = fs.createWriteStream(dest)
          fileWriter.on('finish', () => {
            resolve({
              name: f.name,
              path: f.pathTo,
              dest
            })
          })
          fileWriter.on('error', () => {
            reject()
          })
          if (f.remoteLocation) {
            Layout.downloadResources(f.data).pipe(fileWriter)

          } else {
            fileWriter.write(f.data)
            fileWriter.end()
          }
        } else {
          resolve({
            name: f.name,
            path: f.pathTo,
            dest
          })
        }
      }))
    })
    return Promise.all(promises)
  }

  async writeExtraFiles(folder, chunk) {
    let paths = []
    if (chunk.extraFiles.length > 0) {
      ensureDir(`${folder}/assets`)
      paths = await this.writeAssets(`${folder}/assets`, chunk.extraFiles)
    }
    if (chunk.scriptFiles.length > 0) {
      ensureDir(`${folder}/js`)
      paths = await this.writeAssets(`${folder}/js`, chunk.scriptFiles)
    }
    if (chunk.templateFiles.length > 0) {
      ensureDir(`${folder}/tpl`)
      paths = await this.writeAssets(`${folder}/tpl`, chunk.templateFiles)
    }
    _.forEach(paths, (d) => {
      jp.value(chunk.content, d.path, d.dest.replace(this.output, ''))
    })
  }

}

class FilesLayout extends Layout {

  writeToFile(file, content, plain = false) {
    return fs.writeFileSync(file, !plain ? stringifyContent(content, this.format) : content)
  }

  createCheckpointFile() {
    this.writeToFile(`${this.output}/.cache.json`, JSON.stringify(this.metadata, null, 2), true)
  }

  async processChunk(chunk) {
    try {
      if (chunk.isWritable) {
        const folder = `${this.output}/${chunk.getPath()}`
        await chunk.extractScripts()
        await chunk.extractTemplates()
        await chunk.extractAssets()
        ensureDir(folder)
        await this.writeExtraFiles(folder, chunk)
        this.writeToFile(`${folder}/${slugify(chunk.name, '_')}.${this.format}`, chunk.content)
      }
      return true
    } catch (e) {
      throw e
    }
  }

  _write(chunk, enc, cb) {
    this.processChunk(chunk).then(() => {
      cb()
    }).catch(e => cb(e))
  }

  _final(cb) {
    this.createCheckpointFile()
    cb()
    setTimeout(() => {
      this.emit('end_writing')
    }, 300)
  }

}

class SingleFileLayout extends Layout {

  constructor(output, options) {
    super(output, options)

    Object.assign(privatesAccessor(this), {
      data: {}
    })
  }

  get data() {
    return privatesAccessor(this).data
  }

  writeToFile(file, content) {
    return fs.writeFileSync(file, stringifyContent(content, this.format))
  }

  createCheckpointFile() {
    this.writeToFile(`${this.output}/.cache.json`, JSON.stringify(this.metadata, null, 2))
  }

  async processChunk(chunk) {
    try {
      await chunk.extractScripts()
      await chunk.extractTemplates()
      await chunk.extractAssets()
      await this.writeExtraFiles(this.output, chunk)
      const { key } = chunk
      let exists = pathTo(this.data, key)
      if (!exists) {
        pathTo(this.data, key, [])
        exists = []
      }
      if (_.isArray(exists)) {
        exists.push(chunk.content)
      } else if (_.isObject(exists)) {
        exists = _.extend(exists, chunk.content)
      }
      if (exists) {
        pathTo(this.data, key, exists)
      }
    } catch (e) {
      throw e
    }
  }

  _write(chunk, enc, cb) {
    if (chunk.isWritable) {
      this.processChunk(chunk).then(() => {
        cb()
      }).catch(e => cb(e))
    } else {
      cb()
    }
  }

  _final(cb) {
    this.createCheckpointFile()
    this.writeToFile(`${this.output}/blob.${this.format}`, this.data)
    this.emit('end_writing')
    cb()
  }

}

class ExportFileAdapter extends EventEmitter {

  constructor(outputPath, options = {}) {
    super()
    const { layout = 'tree', format = 'json', mdctl = null } = options,
          output = outputPath || process.cwd(),
          privates = {
            format,
            layout,
            mdctl,
            output,
            cache: `${output}/.cache.json`,
            metadata: {}
          }
    Object.assign(privatesAccessor(this), privates)
    this.loadMetadata()
    this.validateStructure()
    if (layout === 'tree') {
      this.stream = new FilesLayout(privates.output, privates)
    } else if (layout === 'blob') {
      this.stream = new SingleFileLayout(privates.output, privates)
    } else {
      throw new Fault('kLayoutNotSupported', 'the layout export is not supported')
    }
    return this.stream
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
    const { metadata } = privatesAccessor(this)
    return new Promise((resolve, reject) => {
      const data = [],
            outS = new OutputStream({
              ndjson: true,
              template: ef
            })
      outS.on('data', (fileData) => {
        if (fileData.toString() !== '\n') {
          data.push(parseString(fileData.toString()))
        }
      })
      outS.on('error', e => reject(e))
      outS.on('end', () => {
        resolve(data)
      })
      outS.write(stringifyContent(ef, metadata.format))
      outS.end()
    })
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

  get blobIterator() {
    const self = this
    return {
      [Symbol.asyncIterator]() {
        return {
          next: async() => self.getBlobs()
        }
      }
    }
  }

  async getBlobs() {
    const { blobIndex, blobs } = privatesAccessor(this)
    if (blobs.length > blobIndex) {
      privatesAccessor(this, 'blobIndex', blobIndex + 1)
      const stream = await this.getAssetStream(blobs[blobIndex])
      return {
        value: stream, // _.map(stream, s => stringifyContent(s, metadata.format)),
        done: false
      }
    }
    return {
      value: null,
      done: true
    }
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
          const file = `${out}/tpl/${template.exportKey}.${cnt.name}.${TemplatesExt[cnt.name]}`
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
