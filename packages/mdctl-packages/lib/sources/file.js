const path = require('path'),
      fs = require('fs'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      ImportStream = require('@medable/mdctl-core/streams/import_stream'),
      ImportFileTreeAdapter = require('@medable/mdctl-import-adapter'),
      Source = require('./source'),
      ZipTree = require('../zip_tree')

class FileSource extends Source {

  // eslint-disable-next-line no-shadow
  constructor(name, filePath, options = {}) {
    // eslint-disable-next-line no-param-reassign
    filePath = filePath.replace('file://', '')
    super(name, filePath, options)
  }

  checkManifest(manifestEntry, rootPath) {
    if (manifestEntry) {
      const manifestPath = path.join(this.path, rootPath, manifestEntry)

      if (!fs.existsSync(manifestPath)) {
        throw new Error('Manifest not found. Not a valid package.')
      }
    } else {
      const manifestJsonPath = path.join(this.path, rootPath, 'manifest.json'),
            manifestYmlPath = path.join(this.path, rootPath, 'manifest.yml'),
            manifestYamlPath = path.join(this.path, rootPath, 'manifest.yaml')

      if (!fs.existsSync(manifestJsonPath)
        && !fs.existsSync(manifestYmlPath)
        && !fs.existsSync(manifestYamlPath)) {
        throw new Error('Manifest not found. Not a valid package.')
      }
    }
  }

  async readConfigFiles() {
    const rcFile = path.join(this.path, '.mpmrc'),
          pkgPath = path.join(this.path, 'package.json')
    if (fs.existsSync(rcFile)) {
      const rcFileData = fs.readFileSync(rcFile, 'utf8'),
            rcData = JSON.parse(rcFileData.toString()),
            pkgFile = fs.readFileSync(path.join(this.path, rcData.package.root, 'package.json'), 'utf8'),
            pkgInfo = JSON.parse(pkgFile),
            manifestEntry = pkgInfo.manifest
      // check if manifest exist
      this.checkManifest(manifestEntry, rcData.package.root)

      privatesAccessor(this).rootDir = rcData.package.root
      return pkgInfo
    }
    if (fs.existsSync(pkgPath)) {
      const pkg = fs.readFileSync(pkgPath, 'utf8'),
            packageJson = JSON.parse(pkg)
      if (packageJson.object === 'package') {
        this.checkManifest(packageJson.manifest || 'manifest.json', '')
        return packageJson
      }
    }

    throw new Error('No cortex package json file found')
  }

  async loadPackageInfo() {
    const info = await this.readConfigFiles(),
          packageInfo = {
            name: info.name,
            version: info.version,
            dependencies: info.dependencies || {},
            engines: info.engines || {}
          }
    Object.assign(privatesAccessor(this), { ...packageInfo, infoLoaded: true })
  }

  async getStream(asTree = true, format = 'json') {
    const inputDir = path.join(this.path, privatesAccessor(this).rootDir || '')
    let stream
    if (asTree) {
      const zip = new ZipTree(inputDir, { fs })
      stream = zip.compress()
    } else {
      // as ndjson stream
      // eslint-disable-next-line max-len
      const fileAdapter = new ImportFileTreeAdapter(inputDir, format, null), // manifest = null => all files?
            importStream = new ImportStream(fileAdapter)
      stream = importStream
    }
    return stream
  }

}

module.exports = FileSource
