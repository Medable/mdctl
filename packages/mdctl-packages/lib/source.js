const fs = require('fs'),
      path = require('path'),
      ndjson = require('ndjson'),
      { parseString } = require('@medable/mdctl-core-utils/values'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      ImportStream = require('@medable/mdctl-core/streams/import_stream'),
      ImportFileTreeAdapter = require('@medable/mdctl-import-adapter')

class Source {

  constructor(name, pkgPath, options = {}) {
    Object.assign(privatesAccessor(this), {
      name,
      path: pkgPath,
      ...options
    })
  }

  get name() {
    return this.properties.name
  }
  get level() {
    return this.properties.level || 0
  }

  get version() {
    return this.properties.version
  }

  get properties() {
    return privatesAccessor(this)
  }

  get type(){
    return this.constructor.name
  }

  loadPackageJson(pkgPath) {
    if (fs.existsSync(path.join(pkgPath, 'package.json'))) {
      const packageInfo = parseString(fs.readFileSync(path.join(pkgPath, 'package.json')))
      Object.assign(privatesAccessor(this), { repo: pkgPath, ...packageInfo })
      return this
    }
    return null
  }

  readConfigFiles(pkgPath) {
    if (fs.existsSync(path.join(pkgPath, '.mpmrc'))) {
      const mpmrc = parseString(fs.readFileSync(path.join(pkgPath, '.mpmrc')))
      // eslint-disable-next-line no-param-reassign
      pkgPath = path.join(pkgPath, mpmrc.package.root)
      return this.loadPackageJson(pkgPath)
    }
    return this.loadPackageJson(pkgPath)
  }

  async getStream(compress = false) {
    const { repo } = this.properties,
          fileAdapter = new ImportFileTreeAdapter(repo, 'json'),
          importStream = new ImportStream(fileAdapter),
          ndjsonStream = ndjson.stringify()
    return importStream.pipe(ndjsonStream)
  }

}

module.exports = Source
