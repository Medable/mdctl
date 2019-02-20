const fs = require('fs'),
      slugify = require('slugify'),
      Layout = require('./base'),
      { stringifyContent } = require('../../../../utils/values')

class FileTreeLayout extends Layout {

  writeToFile(file, content, plain = false) {
    return fs.writeFileSync(file, !plain ? stringifyContent(content, this.format) : content)
  }

  createCheckpointFile() {
    this.writeToFile(`${this.output}/.cache.json`, JSON.stringify(this.metadata, null, 2), true)
  }

  processChunk(chunk) {
    try {
      if (chunk.key === 'stream') {
        this.writeStreamAsset(chunk)
      } else {
        const folder = `${this.output}/${chunk.getPath()}`
        if (chunk.isFacet) {
          chunk.extractAssets()
          this.writeBinaryFiles(chunk)
        } else {
          // ensureDir(folder)
          chunk.extractScripts()
          chunk.extractTemplates()
          this.writeExtraFiles(folder, chunk)
        }
        if (chunk.isWritable) {
          this.addResource({
            folder,
            id: chunk.id,
            data: chunk.content,
            dest: `${slugify(chunk.name, '_')}.${this.format}`
          })
        }
      }
      return true
    } catch (e) {
      throw e
    }
  }

  _write(chunk, enc, cb) {
    this.processChunk(chunk)
    cb()
  }

  _final(cb) {
    this.writeAndUpdatePaths()
    this.createCheckpointFile()
    cb()
  }

}

module.exports = FileTreeLayout
