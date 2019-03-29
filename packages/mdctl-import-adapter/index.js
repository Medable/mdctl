const EventEmitter = require('events'),
      globby = require('globby'),
      uuid = require('uuid'),
      jp = require('jsonpath'),
      fs = require('fs'),
      _ = require('lodash'),
      { ImportSection } = require('@medable/mdctl-core/streams/section'),
      { parseString } = require('@medable/mdctl-core-utils/values'),
      { md5FileHash } = require('@medable/mdctl-core-utils/crypto'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      { OutputStream } = require('@medable/mdctl-core/streams/chunk-stream'),
      KNOWN_FILES = {
        data: 'data/**/*.{json,yaml}',
        objects: 'env/**/*.{json,yaml}',
        manifest: 'manifest.{json,yaml}'
      }


class ImportFileTreeAdapter extends EventEmitter {

  constructor(inputDir, format, cache) {
    super()
    Object.assign(privatesAccessor(this), {
      files: [],
      input: inputDir || process.cwd(),
      cache: cache || `${inputDir || process.cwd()}/.cache.json`,
      format: format || 'json',
      metadata: {},
      index: 0,
      preparedChunks: []
    })

    this.loadMetadata()
    this.walkFiles(privatesAccessor(this).input)
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
    const { files, preparedChunks } = privatesAccessor(this),
          promises = []
    if (preparedChunks.length) {
      return Promise.resolve(preparedChunks)
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

  walkFiles(dir) {
    const { format } = privatesAccessor(this),
          files = globby.sync([KNOWN_FILES.manifest, KNOWN_FILES.objects], { cwd: dir }),
          mappedFiles = _.map(files, f => `${dir}/${f}`),
          existsManifest = files.indexOf(`manifest.${format}`)
    if (existsManifest === -1) {
      throw new Error('There is no manifest file present on folder')
    }
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
      const nodes = jp.nodes(content, '$..resourceId')
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
        nodes[0].value.forEach((cnt) => {
          if (cnt.data.indexOf('/env') === 0) {
            /* eslint no-param-reassign: "error" */
            const tplFile = `${basePath}${cnt.data}`
            cnt.data = fs.readFileSync(tplFile).toString()
          }
        })
      }
    }
    return true
  }

}


module.exports = ImportFileTreeAdapter
