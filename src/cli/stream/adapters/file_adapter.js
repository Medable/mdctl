const { Writable } = require('stream'),
      jsYaml = require('js-yaml'),
      fs = require('fs'),
      pathTo = require('../../../utils/path.to')

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
    const dataChunk = chunk.data
    if (dataChunk instanceof Array) {
      for (const item of dataChunk) {
        const name = item.name || item.content.name || item.content.code || item.content.label
        fs.writeFileSync(`${this.output}${chunk.getPath(item)}/${name}.${item.format || this.format}`,
          item.plain ? item.content : this.parseContent(item.content))
      }
    } else {
      fs.writeFileSync(`${this.output}${chunk.getPath()}/${chunk.key}.${this.format}`,
        this.parseContent(dataChunk.content))
    }
    cb()
  }

}

class SingleFileLayout extends Layout {

  constructor(output, format) {
    super(output, format)
    this.data = {}
  }

  _write(chunk, enc, cb) {
    const { data } = chunk
    this.data[chunk.key] = data instanceof Array ? data : data.content
    cb()
  }

  _final(cb) {
    fs.writeFileSync(`${this.output}/exported.${this.format}`, this.parseContent(this.data))
    cb()
  }

}

class FileAdapter extends Writable {

  constructor(outputPath, options = { format: 'json', layout: 'files' }) {
    super({ objectMode: true })

    this.format = options.format
    this.layout = options.layout
    this.output = outputPath || `${process.cwd()}/output`
    this.stream = new FilesLayout(this.output, this.format)
    if (this.layout === 'single_file') {
      this.stream = new SingleFileLayout(this.output, this.format)
    }
  }

  _write(chunk, enc, done) {
    this.stream.write(chunk)
    done()
  }

  _final(callback) {
    this.stream.end()
    callback()
  }

}

module.exports = FileAdapter
