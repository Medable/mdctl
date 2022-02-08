const Axios = require('axios'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      { isSet } = require('@medable/mdctl-core-utils/values'),
      unzip = require('unzip-stream'),
      semverMaxSatisfying = require('semver/ranges/max-satisfying'),
      semverSort = require('semver/functions/sort'),
      Source = require('./source')


class RegistryClient {

  constructor(options) {

    if (!isSet(options.registryUrl)) {
      throw new Error('Missing an option --registryUrl or an environment variable REGISTRY_URL.')
    }

    if (!isSet(options.registryProjectId)) {
      throw new Error('Missing an option --registryProjectId or an environment variable REGISTRY_PROJECT_ID.')
    }

    if (!isSet(options.registryToken)) {
      throw new Error('Missing an option --registryToken or an environment variable REGISTRY_TOKEN.')
    }

    this.client = Axios.default.create({
      baseURL: `${options.registryUrl}/${options.registryProjectId}/packages`,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      headers: {
        'PRIVATE-TOKEN': options.registryToken
      }
    })

  }

  async publishPackage(name, version, content) {

    try {

      await this.client.put(`/generic/${name}/${version}/${name}_${version}.zip`, content)

      console.log(`Successfully published package ${name}@${version} to registry`)

    } catch (err) {

      console.error(`Failed to publish package ${name}@${version} to registry`)

      throw err

    }

  }

  async getPackage(name, version) {

    try {

      const { data } = await this.client.get(`/generic/${name}/${version}/${name}_${version}.zip`, {
        responseType: 'stream'
      })

      return data

    } catch (err) {

      console.error(`Failed to get package ${name}@${version} from registry`)

      // TODO: How do we want to handle package not found here?

      throw err

    }

  }

  async getPackageInfo(name) {
    // read the package.json from the package
    try {

      const { data } = await this.client.get(''),
            packages = data.filter(pkg => pkg.name === name).map((pkg) => {

              const result = {
                name: pkg.name,
                version: pkg.version
              }

              return result

            })

      return packages

    } catch (err) {

      throw err

    }

  }

}

class RegistrySource extends Source {

  // options should contain version, registry url, registry token, and registry project id
  constructor(name, version, options = {}) {

    super(name, null, options)

    this.registryClient = new RegistryClient(options)

    privatesAccessor(this).version = version
  }

  get version() {
    const { correctVersion, version } = privatesAccessor(this)
    return correctVersion || version
  }

  async getPackage() {

    return this.registryClient.getPackage(this.name, this.version)

  }

  async publishPackage(content) {

    await this.registryClient.publishPackage(this.name, this.version, content)

  }

  async resolvePackageVersion() {
    const packages = await this.registryClient.getPackageInfo(this.name),
          versions = packages.filter(pkg => pkg).map(pkg => pkg.version),
          sortedVersions = semverSort(versions),
          correctVersion = this.version === 'latest' ? sortedVersions[sortedVersions.length - 1] : semverMaxSatisfying(sortedVersions, this.version)

    if (correctVersion) {
      privatesAccessor(this).correctVersion = correctVersion
    } else {
      throw new Error(`Package ${this.name} has no version ${this.version}`)
    }
  }

  async getPackageJson(pkgZipStream) {
    const streamToBuffer = stream => new Promise((resolve, reject) => {
      const data = []

      stream.on('data', (chunk) => {
        data.push(chunk)
      })

      stream.on('end', () => {
        resolve(Buffer.concat(data))
      })

      stream.on('error', (error) => {
        reject(error)
      })
    })

    return new Promise((resolve, reject) => {
      // Note: unzip-stream parses the zipped package file by file so it might take some time
      //       to find package.json in the zip. Is there any better library to parse it???
      const unzipStream = pkgZipStream.pipe(unzip.Parse()).on('entry', async(entry) => {
        if (entry.path === 'package.json') {
          try {
            const data = await streamToBuffer(entry)
            resolve(data.toString())
          } catch (err) {
            reject(err)
          } finally {
            pkgZipStream.unpipe()
            pkgZipStream.destroy()
            unzipStream.destroy()
          }
        } else {
          entry.autodrain()
        }
      })
    })
  }

  async loadPackageJson() {
    const pkgZipStream = await this.getPackage(),
          packageJson = await this.getPackageJson(pkgZipStream)

    privatesAccessor(this).packageJson = packageJson
  }

  async loadContent() {
    const { loadedZipStream } = privatesAccessor(this)

    if (!loadedZipStream) {
      await this.loadPackageJson()
      privatesAccessor(this).loadedZipStream = true
    }
  }

  async readConfigFiles() {
    await this.resolvePackageVersion()

    await this.loadContent()

    const { packageJson } = privatesAccessor(this)

    if (packageJson) {
      return JSON.parse(packageJson)
    }

    throw new Error('No package.json found')
  }

  async loadPackageInfo() {
    try {
      const info = await this.readConfigFiles(),
            packageInfo = {
              name: info.name,
              version: info.version,
              dependencies: info.dependencies || {},
              engines: info.engines || {}
            }
      Object.assign(privatesAccessor(this), packageInfo)
    } catch (err) {
      throw err
    }
  }

  async getStream() {
    return this.getPackage()
  }

}

module.exports = RegistrySource
