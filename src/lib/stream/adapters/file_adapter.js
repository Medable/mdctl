const { Writable } = require('stream'),
      EventEmitter = require('events'),
      jsYaml = require('js-yaml'),
      fs = require('fs'),
      jp = require('jsonpath'),
      _ = require('lodash'),
      slugify = require('slugify')

class Layout extends Writable {

  constructor(output, format = 'json') {
    super({ objectMode: true })
    this.output = output
    this.format = format
    this.ensure(this.output)
  }

  ensure(directory) {
    const path = directory.replace(/\/$/, '').split('/')
    for (let i = 1; i <= path.length; i++) {
      const segment = path.slice(0, i).join('/')
      if (segment && !fs.existsSync(segment)) {
        fs.mkdirSync(segment)
      }
    }
  }

  parseContent(content) {
    let contentStr = ''
    if (this.format === 'yaml') {
      const objStr = JSON.stringify(content).trim()
      contentStr = jsYaml.safeDump(JSON.parse(objStr))
    } else {
      contentStr = JSON.stringify(content)
    }
    return contentStr
  }

}

class FilesLayout extends Layout {

  writeToFile(file, content, plain = false) {
    return new Promise((success, failure) => {
      const data = plain ? content : this.parseContent(content)
      fs.writeFile(file, data, (err) => {
        if (err) {
          return failure(err)
        }
        return success()
      })
    })
  }

  async writeAssets(path, chunk) {
    const promises = []
    _.forEach(chunk.extraFiles, (f) => {
      promises.push(new Promise((resolve, reject) => {
        const dest = `${path}/${slugify(f.name)}.${f.ext}`,
              fileWriter = fs.createWriteStream(dest)
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
        if (f.hasToDownload) {
          chunk.downloadResources(f.data).pipe(fileWriter)
        } else {
          fileWriter.write(f.data)
          fileWriter.end()
        }
      }))
    })
    return Promise.all(promises)
  }

  async processChunk(chunk) {
    try {
      const folder = `${this.output}/${chunk.getPath()}`
      this.ensure(folder)
      chunk.getScripts()
      await chunk.replaceFacets()
      if (chunk.extraFiles.length > 0) {
        this.ensure(`${folder}/assets`)
        const dests = await this.writeAssets(`${folder}/assets`, chunk)
        _.forEach(dests, (d) => {
          jp.value(chunk.content, d.path, d.dest.replace(this.output, ''))
        })
      }
      await this.writeToFile(`${folder}/${slugify(chunk.name, '_')}.${this.format}`, chunk.content, false)
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
    this.emit('end_writing')
    cb()
  }

}

class SingleFileLayout extends Layout {

  constructor(output, format) {
    super(output, format)
    this.data = {}
  }

  rollbackScripts(chunk) {
    if (chunk.jsInScript) {
      const scripts = Object.keys(chunk.jsInScript)
      scripts.forEach((js) => {
        jp.value(chunk.content, js, chunk.jsInScript[js].value)
      })
      chunk.clearScripts()
    }
  }

  _write(chunk, enc, cb) {
    this.rollbackScripts(chunk)
    const { data } = chunk
    this.data[chunk.key] = data instanceof Array ? data : data.content
    cb()
  }

  _final(cb) {
    return new Promise((resolve, reject) => {
      fs.writeFile(`${this.output}/exported.${this.format}`, this.parseContent(this.data), (err) => {
        if (err) {
          return reject(err)
        }
        return resolve()
      })
    }).then(() => {
      this.emit('process_finished')
      cb()
    }).catch(e => cb(e))
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
