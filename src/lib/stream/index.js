const { Transform, Readable } = require('stream'),
      fs = require('fs'),
      mime = require('mime-types'),
      _ = require('lodash'),
      { ExportSection, ImportSection } = require('./section'),
      Fault = require('../fault'),
      { isCustomName, parseString, stringifyContent } = require('../utils/values'),
      KEYS = ['manifest', 'manifest-dependencies', 'manifest-exports', 'env', 'app', 'config', 'notification', 'policy', 'role', 'smsNumber', 'serviceAccount', 'storageLocation', 'configuration', 'facet', 'object', 'script', 'template', 'view'],
      { privatesAccessor } = require('../privates'),
      { OutputStream } = require('./chunk-stream')

class ExportStream extends Transform {

  constructor(options) {
    super(Object.assign({
      objectMode: true
    }, options))
  }

  checkKeys(name) {
    return KEYS.indexOf(name) > -1 || isCustomName(name)
  }

  _transform(chunk, enc, callback) {
    // Lets push only the allowed keys
    if (!chunk.object) {
      callback(new Fault('kMissingObjectKey', 'There is no object property', 400))
    } else if (chunk.object === 'fault') {
      callback(Fault.from(chunk))
    } else {
      if (this.checkKeys(chunk.object)) {
        const section = new ExportSection(chunk, chunk.object)
        this.push(section)
      }
      // ignore unhandled chunks
      callback()
    }

  }

  _flush(done) {
    done()
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

class ImportStream extends Readable {

  constructor(inputDir) {
    super({ objectMode: true })
    Object.assign(privatesAccessor(this), {
      files: [],
      input: inputDir || process.cwd(),
      cache: `${inputDir || process.cwd()}/.cache.json`,
      metadata: {},
      fileStreams: []
    })

    this.loadMetadata()
    this.readFiles()
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
          if (type === 'application/json' || type === 'application/yaml') {
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

  async readFiles() {
    const {
      input, files, metadata
    } = privatesAccessor(this)

    this.walkFiles(input)

    _.forEach(files, async(f) => {
      const section = await this.loadFile(f)
      await section.loadAssets()
      await section.loadScripts()
      await section.loadTemplates()
      this.push(stringifyContent(section.content, metadata.format))
      if (section.extraFiles && section.extraFiles.length) {
        const promises = []
        _.forEach(section.extraFiles, (ef) => {
          promises.push(new Promise((resolve, reject) => {
            const outS = new OutputStream({
              ndjson: true,
              template: ef
            })
            outS.on('data', (fileData) => {
              this.push(fileData.toString())
            })
            outS.on('error', e => reject(e))
            outS.on('end', () => {
              resolve()
            })
            outS.write(stringifyContent(ef, metadata.format))
            outS.end()
          }))
        })
        await Promise.all(promises)
      }
    })
  }

  loadMetadata() {
    const { cache } = privatesAccessor(this)
    if (fs.existsSync(cache)) {
      const content = fs.readFileSync(cache)
      privatesAccessor(this, 'metadata', JSON.parse(content))
    }
  }

  _read(size) {

  }

}

module.exports = {
  ExportStream,
  ImportStream
}
