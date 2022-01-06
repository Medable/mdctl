const path = require("path"),
      fs = require('fs'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      Source = require('./source'),
      ZipTree = require('../zip_tree')

class FileSource extends Source {

  constructor(name, path, options = {}) {
    path = path.replace('file://', '')
    super(name, path, options);
  }

  async readConfigFiles() {
    const rcFile = fs.readFileSync(path.join(this.path, '.mpmrc'), 'utf8')
    if(rcFile) {
      const rcData = JSON.parse(rcFile.toString()),
            pkgFile = fs.readFileSync(path.join(this.path, path.join( rcData.package.root, 'package.json')), 'utf8')
      return JSON.parse(pkgFile)
    }
    throw new Error('No config file found')

  }

  async loadPackageInfo() {
    const info = await this.readConfigFiles(),
      packageInfo = {
        name: info.name,
        version: info.version,
        dependencies: info.dependencies || {},
        engine: info.engine || {}
      }
    Object.assign(privatesAccessor(this), packageInfo)
  }

  async getStream() {
    const zip = new ZipTree(`/${this.path}`, { fs })
    return zip.compress()
  }

}

module.exports = FileSource
