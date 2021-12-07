const fs = require('fs'),
      path = require('path'),
      { parseString } = require('@medable/mdctl-core-utils/values'),
      { exec } = require('child_process'),
      Source = require('./source'),
      asyncExec = command => new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
          if (error) {
            return reject(error)
          }
          return resolve(stdout.trim())
        })
      })

class GitSource extends Source {

  async cloneRepo() {
    const {
            name, options = {}, packagesDir, path: repoPath
          } = this.properties,
          repoDir = `${packagesDir}/${name}_${new Date().getTime()}`,
          [gitPath, branch] = repoPath.split('#'),
          url = new URL(gitPath.replace('git+', '')),
          repoUrl = options.token ? `${url.protocol}//oauth2:${options.token}@${url.host}${url.pathname}`: url
    await asyncExec(`git clone -n --depth 1 --branch ${branch || 'master'} ${repoUrl} ${repoDir}`)
    return { repoDir }
  }


  async getPackageInfo() {
    const { repoDir } = await this.cloneRepo()
    try {
      await asyncExec(`cd ${repoDir} && git checkout HEAD .mpmrc`)
      return this.readConfigFiles(repoDir)
    } catch (ex) {
      console.log(ex)
    }
    return null
  }

  async readConfigFiles(pkgPath) {
    if (fs.existsSync(path.join(pkgPath, '.mpmrc'))) {
      const mpmrc = parseString(fs.readFileSync(path.join(pkgPath, '.mpmrc')))
      // eslint-disable-next-line no-param-reassign
      await asyncExec(`cd ${pkgPath} && git checkout HEAD ${mpmrc.package.root}/package.json`)
      // eslint-disable-next-line no-param-reassign
      pkgPath = path.join(pkgPath, mpmrc.package.root)
      return this.loadPackageJson(pkgPath)
    }
    return this.loadPackageJson(pkgPath)
  }

  async getStream(compress = false) {
    const { repo } = this.properties
    await asyncExec(`cd ${repo} && git checkout HEAD .`)
    return super.getStream(compress);
  }

}

module.exports = GitSource
