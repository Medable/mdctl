const { Writable } = require('stream'),
      EventEmitter = require('events'),
      jsYaml = require('js-yaml'),
      fs = require('fs'),
      jp = require('jsonpath'),
      _ = require('lodash'),
      request = require('request'),
      slugify = require('slugify'),
      pathTo = require('../../utils/path.to'),      
      { md5FileHash } = require('../../utils/crypto'),
      Fault = require('../../fault')

class Layout extends Writable {

  constructor(output, { format = 'json', metadata = {} }) {
    super({ objectMode: true })
    this.output = output
    this.format = format
    this.ensure(this.output)
    this.metadata = metadata
  }

  static downloadResources(url) {
    return request(url)
  }

  ensure(directory) {
    const path = directory.replace(/\/$/, '').split('/')
    path.forEach((i, k) => {
      const segment = path.slice(0, k + 1).join('/')
      if (segment && !fs.existsSync(segment)) {
        fs.mkdirSync(segment)
      }
    })
  }

  parseContent(content) {
    let contentStr = ''
    if (this.format === 'yaml') {
      const objStr = JSON.stringify(content).trim()
      contentStr = jsYaml.safeDump(JSON.parse(objStr))
    } else {
      contentStr = JSON.stringify(content, null, 2)
    }
    return contentStr
  }

  static fileNeedsUpdate(f, path) {

    if (f.ETag && fs.existsSync(path)) {
      const fileEtag = md5FileHash(path)
      return fileEtag !== f.ETag
    }
    return true
  }

  async writeAssets(path, files) {
    const promises = []
    _.forEach(files, (f) => {
      promises.push(new Promise((resolve, reject) => {
        const dest = `${path}/${slugify(f.name)}.${f.ext}`
        if (Layout.fileNeedsUpdate(f, dest)) {
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
      this.ensure(`${folder}/assets`)
      paths = await this.writeAssets(`${folder}/assets`, chunk.extraFiles)
    }
    if (chunk.scriptFiles.length > 0) {
      this.ensure(`${folder}/js`)
      paths = await this.writeAssets(`${folder}/js`, chunk.scriptFiles)
    }
    _.forEach(paths, (d) => {
      jp.value(chunk.content, d.path, d.dest.replace(this.output, ''))
    })
  }

}

class FilesLayout extends Layout {

  writeToFile(file, content, plain = false) {
    return fs.writeFileSync(file, !plain ? this.parseContent(content) : content)
  }

  createCheckpointFile() {
    this.writeToFile(`${this.output}/.cache.json`, JSON.stringify(this.metadata, null, 2), true)
  }

  async processChunk(chunk) {
    try {
      if (chunk.isWritable) {
        const folder = `${this.output}/${chunk.getPath()}`
        await chunk.extractScripts()
        await chunk.extractAssets()
        this.ensure(folder)
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
    this.data = {}
  }

  writeToFile(file, content) {
    return fs.writeFileSync(file, this.parseContent(content))
  }

  createCheckpointFile() {
    this.writeToFile(`${this.output}/.cache.json`, JSON.stringify(this.metadata, null, 2))
  }

  async processChunk(chunk) {
    try {
      await chunk.extractScripts()
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

class FileAdapter extends EventEmitter {

  constructor(outputPath, options) {
    super()
    const { layout = 'tree', format = 'json', mdctl = null } = options,
          output = outputPath || `${process.cwd()}/output`
    this.layout = layout
    this.format = format
    this.mdctl = mdctl
    this.cacheFile = `${output}/.cache.json`
    this.loadMetadata()
    this.validateStructure()
    this.metadata.format = format
    this.metadata.layout = layout
    if (layout === 'tree') {
      this.stream = new FilesLayout(output, {
        format,
        layout,
        metadata: this.metadata,
        cache: this.cacheFile
      })
    } else if (layout === 'blob') {
      this.stream = new SingleFileLayout(output, {
        format,
        layout,
        metadata: this.metadata,
        cache: this.cacheFile
      })
    } else {
      throw new Fault('kLayoutNotSupported', 'the layout export is not supported')
    }
    return this.stream
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
    const file = this.cacheFile
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file)
      this.metadata = JSON.parse(content)
    } else {
      this.metadata = {}
    }
  }

}

module.exports = FileAdapter
