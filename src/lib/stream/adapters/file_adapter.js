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
    this.chunks = []
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

  async writeAsset(path, chunk) {
    return new Promise((resolve, reject) => {
      const dest = `${path}/${slugify(chunk.extraFile.name)}.${chunk.extraFile.ext}`,
            fileWriter = fs.createWriteStream(dest)
      fileWriter.on('finish', () => {
        resolve()
      })
      fileWriter.on('error', () => {
        reject()
      })
      if (chunk.extraFile.hasToDownload) {
        chunk.downloadResources().pipe(fileWriter)
      } else {
        fileWriter.write(chunk.extraFile.data)
        fileWriter.end()
      }
    })
  }

  async processChunk(chunk) {
    try {
      const folder = `${this.output}/${chunk.getPath()}`
      this.ensure(folder)
      chunk.getScripts()
      await chunk.replaceFacets()
      if (chunk.extraFile !== null) {
        this.ensure(`${folder}/assets`)
        await this.writeAsset(`${folder}/assets`, chunk)
      }
      await this.writeToFile(`${folder}/${slugify(chunk.name, '_')}.${this.format}`, chunk.content, false)
      return true
    } catch (e) {
      throw e
    }
  }

  _write(chunk, enc, cb) {
    this.processChunk(chunk)
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
