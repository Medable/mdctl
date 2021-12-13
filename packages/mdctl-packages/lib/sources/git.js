const git = require('isomorphic-git'),
      http = require('isomorphic-git/http/node'),
     { fs } = require('memfs'),
      path = require('path'),
      Source = require('./source'),
      ZipTree = require('../zip_tree')
const {privatesAccessor} = require("@medable/mdctl-core-utils/privates");

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

  async cloneRepo(checkout = true) {
    const { url, branch } = this.repoInfo
    await git.clone({
      fs,
      http,
      dir: `/${this.name}`,
      noCheckout: checkout,
      url,
      singleBranch: true,
      depth: 1,
      noTags: true,
      ref: branch
    })
  }

  async readConfigFiles() {
    const rcFile = await this.readRemoteFile(`/${this.name}`, '.mpmrc')
    if(rcFile) {
      const rcData = JSON.parse(rcFile.toString()),
            pkgFile = await this.readRemoteFile(`/${this.name}`, path.join( rcData.package.root, 'package.json'))
      return JSON.parse(pkgFile)
    }
    throw new Error('No config file found')

  }

  async readRemoteFile(dir, file) {
    await this.loadContent()
    const { branch } = this.repoInfo
    await git.checkout({
      fs,
      dir,
      ref: branch,
      filepaths: [file],
      force: true /// override current data
    })
    return fs.readFileSync(path.join(dir, file))
  }

  async loadPackageInfo() {
    try {
      const info = await this.readConfigFiles(),
            packageInfo = {
              dependencies: info.dependencies || {},
              engine: info.engine || {}
            }
      Object.assign(privatesAccessor(this), packageInfo)
    } catch (ex) {
      console.log(ex)
    }
  }

  async getStream() {
    const zip = new ZipTree(`/${this.name}`, {fs: this.fs})
    return zip.compress()
  }

}

module.exports = GitSource
