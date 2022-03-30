const git = require('isomorphic-git'),
      http = require('isomorphic-git/http/node'),
      { fs } = require('memfs'),
      path = require('path'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      ImportFileTreeAdapter = require('@medable/mdctl-import-adapter'),
      ImportStream = require('@medable/mdctl-core/streams/import_stream'),
      Source = require('./source'),
      ZipTree = require('../zip_tree')

class GitSource extends Source {

  constructor(name, pathFile, options = {}) {
    if (!options.fs) {
      // eslint-disable-next-line no-param-reassign
      options.fs = fs
    }
    super(name, pathFile, options)
  }

  async loadContent() {
    const { loadedRepo } = privatesAccessor(this)
    if (!loadedRepo) {
      await this.cloneRepo()
      privatesAccessor(this).loadedRepo = true
    }
  }

  get repoInfo() {
    const {
            // eslint-disable-next-line no-shadow
            path, options = {}
          } = privatesAccessor(this),
          [gitPath, branch] = path.split('#'),
          // eslint-disable-next-line no-underscore-dangle
          _url = new URL(gitPath.replace('git+', '')),
          url = options.token ? `${_url.protocol}//oauth2:${options.token}@${_url.host}${_url.pathname}` : _url.toString()
    return {
      branch,
      path: _url.pathname,
      url
    }
  }

  async cloneRepo(noCheckout = true) {
    const { url, branch } = this.repoInfo
    await git.clone({
      fs,
      http,
      dir: `/${this.name}`,
      noCheckout,
      url,
      singleBranch: true,
      depth: 1,
      noTags: true,
      ref: branch,
      force: true
    })
  }

  async readConfigFiles() {
    await this.checkoutFiles(`/${this.name}`, ['.mpmrc', 'package.json'])
    const rcPath = path.join(`/${this.name}`, '.mpmrc'),
          pkgPath = path.join(`/${this.name}`, 'package.json')
    if (fs.existsSync(rcPath)) {
      const rcFileData = this.readFile(rcPath, 'utf8'),
            rcData = JSON.parse(rcFileData.toString())
      await this.checkoutFiles(`/${this.name}`, path.join(rcData.package.root, 'package.json'))
      // eslint-disable-next-line one-var
      const pkgFile = this.readFile(path.join(`/${this.name}`, path.join(rcData.package.root, 'package.json'))),
            packageJson = JSON.parse(pkgFile)
      privatesAccessor(this).rootDir = rcData.package.root
      if (packageJson.object === 'package') {
        await this.checkManifest(packageJson.manifest || 'manifest.json', rcData.package.root)
        return packageJson
      }
    }

    if (fs.existsSync(pkgPath)) {
      const pkg = fs.readFileSync(pkgPath, 'utf8'),
            packageJson = JSON.parse(pkg)
      if (packageJson.object === 'package') {
        await this.checkManifest(packageJson.manifest || 'manifest.json', '')
        return packageJson
      }
    }
    throw new Error('No config file found')

  }

  async checkManifest(manifestEntry, rootPath) {
    await this.checkoutFiles(`/${this.name}`, [
      path.join(rootPath, 'manifest.json'),
      path.join(rootPath, 'manifest.yaml'),
      path.join(rootPath, 'manifest.yml')
    ])
    if (manifestEntry) {
      const manifestPath = path.join(`/${this.name}`, rootPath, manifestEntry)
      if (!fs.existsSync(manifestPath)) {
        throw new Error('Manifest not found. Not a valid package.')
      }
    } else {
      const manifestJsonPath = path.join(`/${this.name}`, rootPath, 'manifest.json'),
            manifestYmlPath = path.join(`/${this.name}`, rootPath, 'manifest.yml'),
            manifestYamlPath = path.join(`/${this.name}`, rootPath, 'manifest.yaml')

      if (!fs.existsSync(manifestJsonPath)
        && !fs.existsSync(manifestYmlPath)
        && !fs.existsSync(manifestYamlPath)) {
        throw new Error('Manifest not found. Not a valid package.')
      }
    }
  }

  async checkoutFiles(dir, files = []) {
    await this.loadContent()
    await git.checkout({
      fs,
      dir,
      filepaths: [...(Array.isArray(files) ? files : [files])],
      force: true // / override current data
    })
  }

  readFile(file) {
    return fs.readFileSync(file)
  }

  async loadPackageInfo() {
    try {
      const info = await this.readConfigFiles(),
            packageInfo = {
              dependencies: info.dependencies || {},
              version: info.version,
              name: info.name,
              engines: info.engines || {}
            }
      Object.assign(privatesAccessor(this), { ...packageInfo, infoLoaded: true })
    } catch (ex) {
      console.log(ex)
    }
  }

  async getStream(asTree = true) {
    await this.cloneRepo(false)
    const inputDir = path.join(`/${this.name}`, privatesAccessor(this).rootDir || '')
    let stream
    if (asTree) {
      const zip = new ZipTree(inputDir, { fs })
      stream = zip.compress()
    } else {
      const fileAdapter = new ImportFileTreeAdapter(inputDir, 'json', null, null, fs), // manifest = null => all files?
            importStream = new ImportStream(fileAdapter)
      stream = importStream
    }

    return stream
  }

}

module.exports = GitSource
