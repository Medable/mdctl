const EventEmitter = require('events'),
      globby = require('globby'),
      uuid = require('uuid'),
      path = require('path'),
      jp = require('jsonpath'),
      fs = require('fs'),
      _ = require('lodash'),
      pluralize = require('pluralize'),
      { ImportSection } = require('@medable/mdctl-core/streams/section'),
      { parseString, isCustomName } = require('@medable/mdctl-core-utils/values'),
      { md5FileHash } = require('@medable/mdctl-node-utils/crypto'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      { OutputStream } = require('@medable/mdctl-core/streams/chunk-stream'),
      { Fault } = require('@medable/mdctl-core'),
      KNOWN_FILES = {
        data: 'data/**/*.{json,yaml}',
        objects: 'env/**/*.{json,yaml}',
        manifest: 'manifest.{json,yaml}',
        package: 'package.{json,yaml}'
      }


class ImportFileTreeAdapter extends EventEmitter {

  constructor(inputDir, format = 'json', manifest = null, cache) {
    super()
    Object.assign(privatesAccessor(this), {
      files: [],
      input: inputDir || process.cwd(),
      cache: cache || `${inputDir || process.cwd()}/.cache.json`,
      format: format || 'json',
      manifest,
      metadata: {},
      index: 0,
      preparedChunks: [],
      preImport: null,
      postImport: null,
      packageData: null
    })

    this.loadMetadata()
    this.readPackageFile()
    this.readManifest()
  }

  preImport() {
    const { preImport, input } = privatesAccessor(this)
    if (preImport) {
      // eslint-disable-next-line global-require,import/no-dynamic-require
      return require(path.join(input, preImport))
    }
    return () => {}
  }

  postImport() {
    const { postImport, input } = privatesAccessor(this)
    if (postImport) {
      // eslint-disable-next-line global-require,import/no-dynamic-require
      return require(path.join(input, postImport))
    }
    return () => {}
  }

  get files() {
    return privatesAccessor(this).files
  }

  get metadata() {
    return privatesAccessor(this).metadata
  }

  static getAssetStream(ef) {
    const outS = new OutputStream({
      ndjson: false,
      template: ef
    })
    return new Promise((resolve, reject) => {
      const lines = []
      ef.data.pipe(outS)
        .on('data', d => lines.push(d))
        .on('error', e => reject(e))
        .on('end', () => resolve(lines))
    })
  }

  get iterator() {
    const self = this
    return {
      [Symbol.asyncIterator]() {
        return {
          next: async() => self.getChunks()
        }
      }
    }
  }

  async loadManifestFromObject() {
    const { manifest, input, format } = privatesAccessor(this),
          section = new ImportSection(manifest, 'manifest', `manifest.${format}`, input)
    return { results: [section.content], blobResults: [] }
  }

  async loadPackageFromObject() {
    const { packageData, input, format } = privatesAccessor(this),
          section = new ImportSection(packageData, 'package', `package.${format}`, input)
    return { results: [section.content], blobResults: [] }
  }

  async loadFileContent(f) {
    const section = await this.loadFile(f)
    await this.loadFacets(section)
    await this.loadScripts(section)
    await this.loadTemplates(section)
    let results = [],
        blobResults = []
    results.push(section.content)

    if (section && section.facets && section.facets.length) {
      results = _.concat(
        results,
        section.facets
      )
      if (section.extraFiles && section.extraFiles.length) {
        const blobs = []
        /* eslint-disable no-restricted-syntax */
        for (const ef of section.extraFiles) {
          blobs.push(ImportFileTreeAdapter.getAssetStream(ef))
        }
        blobResults = _.concat(blobResults, _.flatten(await Promise.all(blobs)))
      }
    }
    return { results, blobResults }
  }

  async prepareChunks() {
    const {
            files, manifest, packageData, preparedChunks
          } = privatesAccessor(this),
          promises = []
    if (preparedChunks.length) {
      return Promise.resolve(preparedChunks)
    }
    if (packageData) {
      promises.push(this.loadPackageFromObject())
    }
    if (manifest) {
      promises.push(this.loadManifestFromObject())
    }
    files.forEach((f) => {
      promises.push(this.loadFileContent(f))
    })
    return Promise.all(promises).then((res) => {
      const results = _.flatten(_.map(res, 'results')),
            blobs = _.flatten(_.flatten(_.map(res, 'blobResults'))),
            data = _.concat(results, blobs)
      privatesAccessor(this, 'preparedChunks', data)
      return data
    })
  }

  async getChunks() {
    const { index } = privatesAccessor(this),
          chunks = await this.prepareChunks()
    if (chunks.length > index) {
      privatesAccessor(this, 'index', index + 1)
      return Promise.resolve({
        done: false,
        value: chunks[index]
      })
    }
    return Promise.resolve({
      done: true,
      value: null
    })
  }

  readPackageFile() {

    let packageData,
        script

    const { input } = privatesAccessor(this),
          location = globby.sync([KNOWN_FILES.package], { cwd: input }),
          paths = [],
          getScript = (...params) => {
            for (const param of params) {
              if (packageData.scripts[param]) {
                return packageData.scripts[param]
              }
            }
            return null
          }

    if (location.length > 0 && fs.existsSync(`${input}/${location[0]}`)) {
      packageData = parseString(fs.readFileSync(`${input}/${location[0]}`))
      paths.push(KNOWN_FILES.package)
    }
    if (packageData) {
      if (packageData.scripts) {
        script = getScript('preImport', 'preimport')
        if (script) {
          privatesAccessor(this, 'preImport', script)
        }
        script = getScript('postImport', 'postimport')
        if (script) {
          privatesAccessor(this, 'postImport', script)
        }
        script = getScript('beforeimport', 'beforeImport', 'preinstall', 'preInstall')
        if (script) {
          const beforeImport = path.join(input, script)
          if (fs.existsSync(beforeImport)) {
            packageData.scripts.beforeImport = fs.readFileSync(beforeImport).toString()
          }
        }
        script = getScript('afterimport', 'afterImport', 'postinstall', 'postInstall')
        if (script) {
          const afterImport = path.join(input, script)
          if (fs.existsSync(afterImport)) {
            packageData.scripts.afterImport = fs.readFileSync(afterImport).toString()
          }
        }
      }
      if (packageData.pipes) {
        if (_.isString(packageData.pipes.ingest)) {
          const ingestPipe = path.join(input, packageData.pipes.ingest)
          if (fs.existsSync(ingestPipe)) {
            packageData.pipes.ingest = fs.readFileSync(ingestPipe).toString()
          }
        }
      }
      if (packageData.manifest) {
        const manifestData = parseString(fs.readFileSync(`${input}/${packageData.manifest}`))
        privatesAccessor(this, 'manifest', manifestData)
      }
      privatesAccessor(this, 'packageData', packageData)
    }

  }

  readManifest() {
    const { manifest, input } = privatesAccessor(this),
          paths = []
    let manifestData = manifest
    if (!manifestData) {
      const location = globby.sync([KNOWN_FILES.manifest], { cwd: input })
      if (location.length > 0 && fs.existsSync(`${input}/${location[0]}`)) {
        manifestData = JSON.parse(fs.readFileSync(`${input}/${location[0]}`))
        paths.push(KNOWN_FILES.manifest)
      } else {
        throw Fault.create('mdctl.kManifestNotFound.error', { reason: 'There is no manifest set as parameter neither found in directory' })
      }
    }
    /* eslint-disable one-var */
    const keys = Object.keys(manifestData)
    for (const k of keys) {
      const { includes } = manifestData[k]
      if (includes instanceof Array) {
        if (includes[0] === '*' && k === 'env') {
          paths.push(`env/${k}.{json,yaml}`)
        } else if (isCustomName(k)) {
          if (includes[0] === '*') {
            paths.push(`data/${pluralize(k)}/**/*.{json,yaml}`)
          } else {
            includes.forEach((inc) => {
              paths.push(`data/${pluralize(k)}/**/${inc}.{json,yaml}`)
            })
          }
        } else {
          includes.forEach((inc) => {
            paths.push(`env/${k}/**/${inc}.{json,yaml}`)
          })
        }
      } else if (manifestData[k] instanceof Array) {
        if(k === 'includes' && manifestData[k][0] === '*') {
          // adding all resources availables inside env/ folder
          paths.push('env/**/*.{json,yaml}')
        } else {
          manifestData[k].forEach((o) => {
            paths.push(`env/${k}/**/${o.name}.{json,yaml}`)
          })
        }
      }
    }
    this.walkFiles(input, paths)
  }

  walkFiles(dir, paths = [KNOWN_FILES.manifest, KNOWN_FILES.objects, KNOWN_FILES.data]) {
    const files = globby.sync(paths, { cwd: dir }),
          mappedFiles = _.map(files, f => `${dir}/${f}`),
          currentFiles = privatesAccessor(this, 'files')
    privatesAccessor(this, 'files', currentFiles.concat(mappedFiles))
  }

  loadFile(file) {
    const {
      input, metadata
    } = privatesAccessor(this)
    return new Promise((resolve, reject) => {
      const contents = []
      fs.createReadStream(file)
        .on('data', (chunk) => {
          contents.push(chunk)
        })
        .on('error', (e) => {
          reject(e)
        })
        .on('end', () => {
          const content = parseString(Buffer.concat(contents), metadata.format)
          resolve(new ImportSection(content, content.object, file, input))
        })
    })
  }

  loadMetadata() {
    const { cache, format } = privatesAccessor(this)
    if (fs.existsSync(cache)) {
      const content = fs.readFileSync(cache),
            metadata = JSON.parse(content.toString())
      metadata.format = format
      privatesAccessor(this, 'metadata', metadata)
    }
  }

  getParentFromPath(chunk, value) {
    const { content } = privatesAccessor(chunk),
          parent = jp.parent(content, jp.stringify(value))
    if (parent.code || parent.name || parent.label || parent.resource) {
      return parent
    }
    value.pop()

    return value.length > 1 ? this.getParentFromPath(chunk, value) : {}
  }

  async loadFacets(chunk) {
    const {
      content, facets, extraFiles, basePath
    } = privatesAccessor(chunk)
    return new Promise(async(success) => {
      const nodes = jp.nodes(content, '$..filePath')
      if (nodes.length) {
        _.forEach(nodes, (n) => {
          const parent = this.getParentFromPath(chunk, n.path),
                facet = Object.assign(parent, {}),
                localFile = `${basePath}${facet.filePath}`
          if (facet.filePath) {
            const resourceKey = uuid.v4(),
                  asset = {
                    streamId: resourceKey,
                    data: fs.createReadStream(localFile),
                    object: 'stream'
                  }
            facet.ETag = md5FileHash(localFile)
            facet.streamId = resourceKey
            facet.resourceId = resourceKey
            extraFiles.push(asset)
          }
          delete facet.filePath
          facets.push(facet)
        })
        privatesAccessor(chunk, 'facets', facets)
        privatesAccessor(chunk, 'extraFiles', extraFiles)
        return success()
      }
      return success()
    })
  }

  async loadScripts(chunk) {
    if (chunk.key === 'package') {
      const { content: { scripts } } = chunk,
            { preInstall, postInstall } = scripts,
            { input } = privatesAccessor(this)

      if (preInstall) {
        scripts.preInstall = fs.readFileSync(path.join(input, preInstall)).toString()
      }
      if (postInstall) {
        scripts.postInstall = fs.readFileSync(path.join(input, postInstall)).toString()
      }
    } else {
      const { content, basePath } = privatesAccessor(chunk),
            nodes = jp.nodes(content, '$..script')
      nodes.forEach((n) => {
        if (!_.isObject(n.value)) {
          if (n.value.indexOf('/env') === 0) {
            const jsFile = `${basePath}${n.value}`
            jp.value(content, jp.stringify(n.path), fs.readFileSync(jsFile).toString())
          }
        }
      })
    }
    return true
  }

  async loadTemplates(chunk) {
    const { content, key, basePath } = privatesAccessor(chunk)
    if (key === 'template') {
      if (_.isArray(content.localizations)) {
        const nodes = jp.nodes(content.localizations, '$..content')
        nodes.forEach((n) => {
          n.value.forEach((cnt) => {
            if (cnt.data.indexOf('/env') === 0) {
              /* eslint no-param-reassign: "error" */
              const tplFile = `${basePath}${cnt.data}`
              cnt.data = fs.readFileSync(tplFile).toString()
            }
          })
        })
      }
    }
    return true
  }

}


module.exports = ImportFileTreeAdapter
