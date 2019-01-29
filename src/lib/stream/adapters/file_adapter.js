const { Writable } = require('stream'),
      jsYaml = require('js-yaml'),
      fs = require('fs'),
      jp = require('jsonpath')

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
    if (this.format === 'yaml') {
      // Adding workaround for undefined content
      return jsYaml.safeDump(JSON.parse(JSON.stringify(content)))
    }
    return JSON.stringify(content)
  }

}

class FilesLayout extends Layout {

  async writeToFile(file, content, plain = false) {
    return new Promise((resolve, reject) => {
      const data = plain ? content : this.parseContent(content)
      const result = fs.writeFileSync(file, data)
      return result
    })
  }

  async processChunks(chunk) {
    const folder = `${this.output}/${chunk.getPath()}`
    this.ensure(folder)
    try {
      await this.writeToFile(`${folder}/${chunk.name}.${this.format}`, this.parseContent(chunk.content), false)
    } catch (e) {
      console.log(e)
      throw e
    }

  }

  _write(chunk, enc, cb) {
    this.processChunks(chunk)
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
        if (err) return reject(err)
        return resolve()
      })
    }).then(cb).catch(e => cb(e))
  }

}

class FileAdapter {

  constructor(outputPath, options = { format: 'json', layout: 'files' }) {
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
