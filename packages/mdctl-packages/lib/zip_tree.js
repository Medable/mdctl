const path = require('path'),
      asyncLib = require('async'),
      Zip = require('jszip'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      // Limiting the number of files read at the same time
      maxOpenFiles = 500


class ZipTree {

  constructor(rootDir, options = {}) {
    const { fs } = options,
          zip = new Zip()
    Object.assign(privatesAccessor(this), {
      // eslint-disable-next-line global-require
      fs: fs || require('fs'),
      options,
      zip,
      folders: {
        [path.resolve(rootDir)]: zip
      },
      rootDir: path.resolve(rootDir),
      fileQueue: asyncLib.queue((task, callback) => {
        // eslint-disable-next-line no-shadow
        const { fs, folders, options } = privatesAccessor(this)
        fs.readFile(task.fullPath, (err, data) => {
          if (options.each) {
            options.each(path.join(task.dir, task.file))
          }
          folders[task.dir].file(task.file, data)
          callback(err)
        })
      }, maxOpenFiles)
    })
  }

  async compress() {
    const { rootDir, zip } = privatesAccessor(this)
    await this.dive(rootDir)
    return zip.generateNodeStream({
      streamFiles: true,
      compression: 'DEFLATE',
      compressionOptions: {
        level: 9
      },
      type: 'nodebuffer'
    })
  }

  async dive(dir) {
    const { fs } = privatesAccessor(this),
          files = fs.readdirSync(dir)

    if (!files.length) {
      return
    }
    let count = files.length
    // eslint-disable-next-line no-restricted-syntax
    for (const file of files) {
      const fullPath = path.resolve(dir, file)
      // eslint-disable-next-line no-await-in-loop
      await this.addItem(fullPath)
      // eslint-disable-next-line no-plusplus
      if (!--count) {
        break
      }
    }
  }

  async addItem(fullPath) {
    const {
            fs, folders, options, fileQueue
          } = privatesAccessor(this),
          stat = fs.statSync(fullPath)

    if (options.filter && !options.filter(fullPath, stat)) {
      return
    }

    // eslint-disable-next-line one-var
    const dir = path.dirname(fullPath),
          file = path.basename(fullPath)
    let parentZip
    if (stat.isDirectory()) {
      parentZip = folders[dir]
      if (options.each) {
        options.each(fullPath)
      }
      folders[fullPath] = parentZip.folder(file)
      await this.dive(fullPath)
    } else {
      await new Promise((resolve, reject) => {
        fileQueue.push({ fullPath, dir, file }, (err) => {
          if (err) {
            return reject(err)
          }
          return resolve()
        })
      })
    }
  }

}

module.exports = ZipTree
