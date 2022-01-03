const git = require('isomorphic-git'),
      http = require('isomorphic-git/http/node'),
     { fs } = require('memfs'),
      path = require('path'),
      Source = require('./source'),
      ZipTree = require('../zip_tree')
const {privatesAccessor} = require("@medable/mdctl-core-utils/privates");
const {checkout} = require("isomorphic-git");

class GitSource extends Source {

  constructor(name, path, options = {}) {
    if(!options.fs) {
      options.fs = fs
    }
    super(name, path, options);
  }

  async loadContent() {
    const { loadedRepo } = privatesAccessor(this)
    if(!loadedRepo) {
      await this.cloneRepo()
      privatesAccessor(this).loadedRepo = true
    }
  }

  get repoInfo() {
    const {
        path, options = {}
      } = privatesAccessor(this),
      [gitPath, branch] = path.split('#'),
      _url = new URL(gitPath.replace('git+', '')),
      url = options.token ? `${_url.protocol}//oauth2:${options.token}@${_url.host}${_url.pathname}`: _url.toString()
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
    await this.checkoutFiles(`/${this.name}`, '.mpmrc')
    const rcFile = this.readFile(path.join(`/${this.name}`, '.mpmrc'))
    if(rcFile) {
      const rcData = JSON.parse(rcFile.toString())
      await this.checkoutFiles(`/${this.name}`, path.join( rcData.package.root, 'package.json'))
      const pkgFile = this.readFile(path.join(`/${this.name}`, path.join( rcData.package.root, 'package.json')))
      privatesAccessor(this).rootDir = rcData.package.root
      return JSON.parse(pkgFile)
    }
    throw new Error('No config file found')

  }

  async checkoutFiles(dir, files = []) {
    await this.loadContent()
    const { branch } = this.repoInfo
    await git.checkout({
      fs,
      dir,
      //ref: branch,
      filepaths: [...(Array.isArray(files) ? files: [files])],
      force: true /// override current data
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
              engine: info.engine || {}
            }
      Object.assign(privatesAccessor(this), packageInfo)
    } catch (ex) {
      console.log(ex)
    }
  }

  async getStream() {
    await this.cloneRepo(false)
    const zip = new ZipTree(path.join(`/${this.name}`, privatesAccessor(this).rootDir), { fs })
    return zip.compress()
  }

}

module.exports = GitSource
