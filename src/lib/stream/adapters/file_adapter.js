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

  ensure(path) {
    if (!fs.existsSync(path)) {
      fs.mkdirSync(path, { recursive: true })
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

  _write(chunk, enc, cb) {
    chunk.namespaces.forEach(n => this.ensure(`${this.output}/${n}`))
    const dataChunk = chunk.data,
          promises = []
    if (dataChunk instanceof Array) {
      dataChunk.forEach((item) => {
        const name = item.name || item.content.name || item.content.code || item.content.label
        promises.push(new Promise((resolve, reject) => {
          fs.writeFile(`${this.output}${chunk.getPath(item)}/${name}.${item.format || this.format}`,
            item.plain ? item.content : this.parseContent(item.content), (err) => {
              if (err) return reject(err)
              return resolve()
            })
        }))
      })
    } else {
      promises.push(new Promise((resolve, reject) => {
        fs.writeFile(`${this.output}${chunk.getPath()}/${chunk.key}.${this.format}`,
          this.parseContent(dataChunk.content), (err) => {
            if (err) return reject(err)
            return resolve()
          })
      }))
    }
    return Promise.all(promises).then(() => {
      cb()
    }).catch(e => cb(e))
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
