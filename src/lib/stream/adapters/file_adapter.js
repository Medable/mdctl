const { Writable } = require('stream'),
      EventEmitter = require('events'),
      jsYaml = require('js-yaml'),
      fs = require('fs'),
      jp = require('jsonpath'),
      _ = require('lodash'),
      request = require('request'),
      slugify = require('slugify'),
      pathTo = require('../../utils/path.to')

class Layout extends Writable {

  constructor(output, format = 'json') {
    super({ objectMode: true })
    this.output = output
    this.format = format
    this.ensure(this.output)
    this.metadata = {
      assets: []
    }
    this.loadMetadata()
  }

  static downloadResources(url) {
    return request(url)
  }

  loadMetadata() {
    const file = `${this.output}/_metadata.${this.format}`
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file)
      this.metadata = this.format === 'json' ? JSON.parse(content) : jsYaml.safeLoad(content)
    }
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

  checkFileETagExists(ETag) {
    const cnf = ETag && _.find(this.metadata.assets, c => c.ETag === ETag)
    if (cnf && !fs.existsSync(cnf.path)) {
      return false
    }
    return !!cnf
  }

  updateMetadata(f, dest) {
    const cnf = _.find(this.metadata.assets, c => c.name === f.name),
          relativeDest = dest.replace(this.output, '')
    if (cnf) {
      cnf.ETag = f.ETag
      if (cnf.path !== relativeDest) {
        fs.unlinkSync(`${this.output}${cnf.path}`)
        cnf.path = relativeDest
      }
    } else {
      this.metadata.assets.push({
        name: f.name,
        path: relativeDest,
        ETag: f.ETag
      })
    }
  }

  async writeAssets(path, files) {
    const promises = []
    _.forEach(files, (f) => {
      promises.push(new Promise((resolve, reject) => {
        const dest = `${path}/${slugify(f.name)}.${f.ext}`
        if (!this.checkFileETagExists(f.ETag)) {
          const fileWriter = fs.createWriteStream(dest)
          fileWriter.on('finish', () => {
            if (f.ETag) {
              this.updateMetadata(f, dest)
            }
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

  writeToFile(file, content) {
    return fs.writeFileSync(file, this.parseContent(content))
  }

  createCheckpointFile() {
    this.writeToFile(`${this.output}/_metadata.${this.format}`, this.metadata)
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

  constructor(output, format) {
    super(output, format)
    this.data = {}
  }

  writeToFile(file, content) {
    return fs.writeFileSync(file, this.parseContent(content))
  }

  createCheckpointFile() {
    this.writeToFile(`${this.output}/_metadata.${this.format}`, this.metadata)
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

  constructor(outputPath, options = { format: 'json', layout: 'files' }) {
    super()
    const { layout, format } = options,
          output = outputPath || `${process.cwd()}/output`
    this.stream = new FilesLayout(output, format)
    if (layout === 'blob') {
      this.stream = new SingleFileLayout(output, format)
    }
    return this.stream
  }

}

module.exports = FileAdapter
