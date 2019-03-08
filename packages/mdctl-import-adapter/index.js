const { Transform } = require('stream'),
      EventEmitter = require('events'),
      globby = require('globby'),
      mime = require('mime-types'),
      uuid = require('uuid'),
      jp = require('jsonpath'),
      fs = require('fs'),
      _ = require('lodash'),
      { ImportSection } = require('@medable/mdctl-core/streams/section'),
      { stringifyContent, parseString } = require('@medable/mdctl-core-utils/values'),
      { md5FileHash } = require('@medable/mdctl-core-utils/crypto'),
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      { OutputStream } = require('./chunk-stream'),
      KNOWN_FILES = {
        data: 'data/**/*.{json,yaml}',
        objects: 'env/**/*.{json,yaml}',
        manifest: 'manifest.{json,yaml}'
      }

class ImportFileTransformStream extends Transform {

  constructor(metadata, file, basePath = process.cwd()) {
    super({ objectMode: true })
    Object.assign(privatesAccessor(this), {
      metadata,
      mime: mime.lookup(file),
      file,
      basePath
    })
  }

  get metadata() {
    return privatesAccessor(this).metadata
  }

  _transform(chunk, enc, callback) {
    const { metadata, basePath, file } = privatesAccessor(this)
    try {
      const content = parseString(chunk, metadata.format)
      this.push(new ImportSection(content, content.object, file, basePath))
    } catch (e) {
      console.log(e, chunk.toString())
    }
    callback()
  }

}

class ImportFileTreeAdapter extends EventEmitter {

  constructor(inputDir, cache, format) {
    super()
    Object.assign(privatesAccessor(this), {
      files: [],
      input: inputDir || process.cwd(),
      cache: cache || `${inputDir || process.cwd()}/.cache.json`,
      format: format || 'json',
      metadata: {},
      blobs: [],
      index: 0,
      blobIndex: 0
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

  getAssetStream(ef) {
    const { metadata } = privatesAccessor(this),
          outS = new OutputStream({
            ndjson: false,
            template: ef
          })
    outS.write(stringifyContent(ef, metadata.format))
    outS.end()
    return outS
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


  get blobs() {
    return privatesAccessor(this).blobs
  }

  async getChunks() {
    const { files, index } = privatesAccessor(this),
          result = {
            done: false,
            value: []
          }
    let { blobs } = privatesAccessor(this)
    if (files.length > index) {
      // Increment index processing
      privatesAccessor(this, 'index', index + 1)

      const f = files[index],
            section = await this.loadFile(f)

      await this.loadFacets(section)
      await this.loadScripts(section)
      await this.loadTemplates(section)
      result.value.push(section.content)

      if (section && section.facets && section.facets.length) {
        result.value = _.concat(
          result.value,
          section.facets
        )
        if (section.extraFiles && section.extraFiles.length) {
          blobs = _.concat(blobs, section.extraFiles)
        }
        privatesAccessor(this, 'blobs', blobs)
      }

      return result

    }
    return {
      value: null,
      done: true
    }
  }

  walkFiles(dir) {
    const files = globby.sync([KNOWN_FILES.manifest, KNOWN_FILES.objects], { cwd: dir }),
          mappedFiles = _.map(files, f => `${dir}/${f}`)
    privatesAccessor(this, 'files', mappedFiles)
  }

  loadFile(file) {
    const {
      input, metadata
    } = privatesAccessor(this)
    return new Promise((resolve, reject) => {
      const contents = []
      fs.createReadStream(file).pipe(new ImportFileTransformStream(metadata, file, input))
        .on('data', (chunk) => {
          contents.push(chunk)
        })
        .on('error', (e) => {
          reject(e)
        })
        .on('end', () => {
          resolve(contents[0])
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
                    data: fs.readFileSync(localFile),
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
        const parent = this.getParentFromPath(chunk, n.path)
        if (parent.script.indexOf('/env') === 0) {
          const jsFile = `${basePath}${parent.script}`
          parent.script = fs.readFileSync(jsFile).toString()
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
