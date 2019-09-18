const EventEmitter = require('events'),
      globby = require('globby'),
      uuid = require('uuid'),
      jp = require('jsonpath'),
      fs = require('fs'),
      _ = require('lodash'),
      pluralize = require('pluralize'),
      { ImportSection } = require('@medable/mdctl-core/streams/section'),
      { parseString, isCustomName } = require('@medable/mdctl-core-utils/values'),
      { md5FileHash } = require('@medable/mdctl-core-utils/crypto'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      { OutputStream } = require('@medable/mdctl-core/streams/chunk-stream'),
      { Fault } = require('@medable/mdctl-core'),
      KNOWN_FILES = {
        data: 'data/**/*.{json,yaml}',
        objects: 'env/**/*.{json,yaml}',
        manifest: 'manifest.{json,yaml}'
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
      preparedChunks: []
    })

    this.loadMetadata()
    this.readManifest()
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
    const { files, manifest, preparedChunks } = privatesAccessor(this),
          promises = []
    if (preparedChunks.length) {
      return Promise.resolve(preparedChunks)
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
        throw Fault.from({ code: 'kManifestNotFound', reason: 'There is no manifest defined neither found in directory' })
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
            paths.push(`data/${pluralize(k)}/*.{json,yaml}`)
          } else {
            includes.forEach((inc) => {
              paths.push(`data/${pluralize(k)}/${inc}.{json,yaml}`)
            })
          }
        } else {
          includes.forEach((inc) => {
            paths.push(`env/${k}/${inc}.{json,yaml}`)
          })
        }
      } else if (manifestData[k] instanceof Array) {
        manifestData[k].forEach((o) => {
          paths.push(`env/${k}/${o.name}.{json,yaml}`)
        })
      }
    }
    this.walkFiles(input, paths)
  }

  walkFiles(dir, paths = [KNOWN_FILES.manifest, KNOWN_FILES.objects, KNOWN_FILES.data]) {
    const files = globby.sync(paths, { cwd: dir }),
          mappedFiles = _.map(files, f => `${dir}/${f}`)
    privatesAccessor(this, 'files', mappedFiles)
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

  getParentFromPath(chunk, path) {
    const { content } = privatesAccessor(chunk),
          parent = jp.parent(content, jp.stringify(path))
    if (parent.code || parent.name || parent.label || parent.resource) {
      return parent
    }
    path.pop()

    return path.length > 1 ? this.getParentFromPath(chunk, path) : {}
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
