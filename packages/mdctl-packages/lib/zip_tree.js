const path = require('path'),
  asyncLib = require('async'),
  Zip = require('jszip'),
  {privatesAccessor} = require('@medable/mdctl-core-utils/privates'),
  // Limiting the number of files read at the same time
  maxOpenFiles = 500
const {resolve} = require("eslint-plugin-promise/rules/lib/promise-statics");


class ZipTree {

  constructor(rootDir, options = {}) {
    const { fs } = options,
      zip = new Zip()
    Object.assign(privatesAccessor(this), {
      fs: fs || require('fs'),
      options,
      zip,
      folders: {
        [path.resolve(rootDir)]: zip
      },
      rootDir: path.resolve(rootDir),
      fileQueue: asyncLib.queue((task, callback) => {
        const {fs, folders, options} = privatesAccessor(this)
        fs.readFile(task.fullPath, function (err, data) {
          if (options.each) {
            options.each(path.join(task.dir, task.file))
          }
          folders[task.dir].file(task.file, data)
          callback(err)
        });
      }, maxOpenFiles)
    })
  }

  async compress() {
    const {rootDir, zip} = privatesAccessor(this)
    await this.dive(rootDir)
    return zip.generateNodeStream({
      streamFiles:true,
      compression: 'DEFLATE',
      compressionOptions: {
        level: 9
      },
      type: 'nodebuffer'
    })
  }

  async dive(dir) {
    const {fs} = privatesAccessor(this),
      files = fs.readdirSync(dir)

    if (!files.length) {
      return
    }
    let count = files.length
    for (const file of files) {
      const fullPath = path.resolve(dir, file)
      await this.addItem(fullPath)
      if (!--count) {
        break
      }
    }
  }

  async addItem(fullPath) {
    const {fs, folders, options, fileQueue} = privatesAccessor(this),
      stat = fs.statSync(fullPath)

    if (options.filter && !options.filter(fullPath, stat)) {
      return
    }

    const dir = path.dirname(fullPath),
      file = path.basename(fullPath)
    let parentZip
    if (stat.isDirectory()) {
      parentZip = folders[dir]
      if (options.each) {
        options.each(fullPath)
      }
      folders[fullPath] = parentZip.folder(file);
      await this.dive(fullPath)
    } else {
      await new Promise((resolve, reject) => {
        fileQueue.push({fullPath: fullPath, dir: dir, file: file}, (err) => {
          if(err) {
            return reject(err)
          }
          return resolve()
        })
      })
    }
  }

}

module.exports = ZipTree
