const { Writable, Transform } = require('stream'),
      EventEmitter = require('events'),
      path = require('path'),
      mime = require('mime-types'),
      { getExtension } = require('mime'),
      fs = require('fs'),
      jp = require('jsonpath'),
      _ = require('lodash'),
      request = require('request'),
      slugify = require('slugify'),
      pluralize = require('pluralize'),
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
      metadata,
      binaries: []
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

  async writeBinaryAsset(folder, f, notDownload = false) {
    return new Promise((resolve, reject) => {
      const dest = `${folder}/${slugify(f.name)}.${f.ext}`
      if(Layout.fileNeedsUpdate(f, dest) && !notDownload) {
        const fileWriter = fs.createWriteStream(dest)
        fileWriter.on('finish', () => {
          resolve({
            name: f.name,
            path: f.pathTo,
            targetFilePath: f.sectionPath,
            dest
          })
        })
        fileWriter.on('error', (e) => {
          reject(e)
        })

        if (f.url) {
          Layout.downloadResources(f.url).pipe(fileWriter)
        } else if (f.base64) {
          fileWriter.write(f.base64)
          fileWriter.end()
        } else if (f.streamId) {
          // TBD
        } else {
          resolve({
            name: f.name,
            path: f.pathTo,
            dest
          })
        }
      } else {
        resolve({
          name: f.name,
          path: f.pathTo,
          dest
        })
      }
    })
  }

  async writeAssets(folder, files, notDownload = false) {
    const promises = []
    _.forEach(files, (f) => {
      promises.push(this.writeBinaryAsset(folder, f, notDownload))
    })
    return Promise.all(promises)
  }

  async updatePaths() {
    const { binaries } = privatesAccessor(this),
          paths = _.groupBy(binaries, 'targetFilePath'),
          keys = Object.keys(paths)

    _.forEach(keys, (k) => {
      const updates = paths[k],
            content = parseString(fs.readFileSync(k), this.format)
      _.forEach(updates, (d) => {
        jp.value(content, d.path, d.dest.replace(this.output, ''))
      })
      fs.writeFileSync(k, stringifyContent(content, this.format))
    })
  }

  async writeBinaryFiles(chunk) {
    if (chunk.extraFiles.length > 0) {
      const promises = []
      _.forEach(chunk.extraFiles, (ef) => {
        const folder = `${path.dirname(ef.sectionPath)}/assets`
        ensureDir(folder)
        promises.push(this.writeBinaryAsset(folder, ef))
      })
      privatesAccessor(this, 'binaries', _.concat(privatesAccessor(this).binaries, await Promise.all(promises)))
    }
  }

  async writeExtraFiles(folder, chunk) {
    let paths = []
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
      const folder = `${this.output}/${chunk.getPath()}`
      if (chunk.isFacet) {
        await chunk.extractAssets()
        await this.writeBinaryFiles(chunk)
      } else {
        ensureDir(folder)
        await chunk.extractScripts()
        await chunk.extractTemplates()
        await this.writeExtraFiles(folder, chunk)
      }

      if (chunk.isWritable) {
        const filePath = `${folder}/${slugify(chunk.name, '_')}.${this.format}`
        this.writeToFile(filePath, chunk.content)
        chunk.updateSectionPath(filePath)
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
    this.updatePaths()
    this.createCheckpointFile()
    cb()
    setTimeout(() => {
      this.emit('end_writing')
    }, 300)
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
