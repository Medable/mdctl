const { Writable } = require('stream'),
      jsYaml = require('js-yaml'),
      fs = require('fs')

class FileAdapter extends Writable {

  constructor(outputPath, format = 'json', options = {}) {
    super(Object.assign({
      objectMode: true
    }, options))
    this.format = format
    this.output = outputPath || `${process.cwd()}/output`
    this.ensure(this.output)
  }

  ensure(path) {
    !fs.existsSync(path) && fs.mkdirSync(path, { recursive: true })
  }

  parseContent(content) {
    if(this.format === 'yaml') {
      return jsYaml.safeDump(content)
    }
    return JSON.stringify(content)
  }

  _write(chunk, enc, done) {
    if(chunk.key !== 'env') {
      const path = `${this.output}/${chunk.key}`
      this.ensure(path)
      if (chunk.key === 'scripts') {
        this.ensure(`${path}/library`)
        this.ensure(`${path}/job`)
        this.ensure(`${path}/route`)
        this.ensure(`${path}/trigger`)
        this.ensure(`${path}/js`)
      }

      for (let item of chunk.content) {
        const name = item.name || item.code || item.label
        if(chunk.key === 'scripts') {
          fs.writeFileSync(`${path}/${item.type}/${name}.${this.format}`, this.parseContent(item))
        } else {
          fs.writeFileSync(`${path}/${name}.${this.format}`, this.parseContent(item))
        }
      }
      done()

    } else {
      // save file directly
      fs.writeFileSync(`${this.output}/${chunk.key}.${this.format}`, JSON.stringify(chunk.content))
      done()
    }
  }

}

module.exports = FileAdapter
