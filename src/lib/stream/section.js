const slugify = require('slugify'),
      _ = require('lodash'),
      fs = require('fs'),
      jp = require('jsonpath'),
      mime = require('mime'),
      uuid = require('uuid'),
      pluralize = require('pluralize'),
      { isCustomName } = require('../utils/values'),
      ENV_KEYS = {
        keys: ['app', 'config', 'notification', 'policy', 'role', 'smsNumber', 'serviceAccount', 'storageLocation', 'configuration', 'template', 'object', 'script', 'view'],
        folder: 'env'
      },
      DATA_KEYS = {
        keys: [''],
        folder: 'data'
      },
      MANIFEST_KEYS = {
        keys: ['manifest', 'manifest-dependencies', 'manifest-exports'],
        folder: ''
      },
      NON_WRITABLE_KEYS = ['facet'],
      SectionsCreated = [],
      TemplatesExt = {
        html: 'html',
        plain: 'txt',
        subject: 'txt'
      },
      { privatesAccessor } = require('../privates')

class ExportSection {

  constructor(content, key = '') {

    Object.assign(privatesAccessor(this), {
      content,
      key,
      scriptFiles: [],
      extraFiles: [],
      templateFiles: []
    })
    SectionsCreated.push(this)
    if (new.target === ExportSection) {
      Object.seal(this)
    }
  }

  get key() {
    return privatesAccessor(this).key
  }

  get content() {
    return privatesAccessor(this).content
  }

  get extraFiles() {
    return privatesAccessor(this).extraFiles
  }

  get scriptFiles() {
    return privatesAccessor(this).scriptFiles
  }

  get templateFiles() {
    return privatesAccessor(this).templateFiles
  }

  get name() {
    const { content, key } = privatesAccessor(this),
          { resource, object } = content,
          [objectName, resourceName] = (resource || object).split('.')

    if (key === 'env') {
      return key
    }
    if (MANIFEST_KEYS.keys.slice(1).indexOf(key) > -1) {
      return key.replace('manifest-', '')
    }
    return resourceName || objectName
  }

  get isWritable() {
    return NON_WRITABLE_KEYS.indexOf(privatesAccessor(this).key) < 0
  }

  getPath() {
    const { key, content } = privatesAccessor(this),
          { object } = content
    let path = ''
    if (ENV_KEYS.keys.indexOf(key) > -1) {
      path = ENV_KEYS.folder
    } else if (DATA_KEYS.keys.indexOf(key) > -1) {
      path = DATA_KEYS.folder
    } else if (MANIFEST_KEYS.keys.indexOf(key) > -1) {
      path = MANIFEST_KEYS.folder
    }
    if (object === 'env') {
      path = this.name
    } else if (isCustomName(object)) {
      path = `data/${pluralize(object)}`
    } else if (path) {
      path = `${path}/${pluralize(object)}`
    }
    return path
  }

  getParentFromPath(path) {
    const { content } = privatesAccessor(this),
          parent = jp.parent(content, jp.stringify(path))
    if (parent.code || parent.name || parent.label) {
      return parent
    }
    path.pop()
    return this.getParentFromPath(path)
  }

  extractAssets() {
    return new Promise(async(success) => {
      const nodes = jp.nodes(privatesAccessor(this).content, '$..resourceId')
      if (nodes.length) {
        _.forEach(nodes, (n) => {
          const parent = this.getParentFromPath(n.path),
                facets = _.filter(SectionsCreated, sc => sc.key === 'facet'),
                facet = _.find(facets, f => parent.resourceId === f.content.resourceId)
          if (facet) {
            n.path.splice(n.path.length - 1, 1, 'filePath')
            const { content } = facet,
                  objectPath = jp.stringify(n.path),
                  name = `${content.resourcePath}.${slugify(content.name, '_')}`
            privatesAccessor(this).extraFiles.push({
              name,
              facet,
              ext: mime.getExtension(content.mime),
              data: content.url || content.base64,
              remoteLocation: !!content.url,
              pathTo: objectPath,
              ETag: parent.ETag
            })
          }
        })
        return success()
      }
      return success()
    })
  }

  async extractScripts() {
    const { content, scriptFiles } = privatesAccessor(this),
          nodes = jp.nodes(content, '$..script')
    nodes.forEach((n) => {
      if (!_.isObject(n.value)) {
        const path = _.clone(n.path),
              parent = this.getParentFromPath(n.path),
              type = parent.type || `${content.resource}.${n.path.slice(1).join('.')}`,
              name = `${type}.${slugify(parent.code || parent.name || parent.label, '_')}`
        scriptFiles.push({
          name,
          ext: 'js',
          data: n.value,
          remoteLocation: false,
          pathTo: jp.stringify(path)
        })
      }
    })
    privatesAccessor(this, 'scriptFiles', scriptFiles)
    return true
  }

  async extractTemplates() {
    const { key, content, templateFiles } = privatesAccessor(this)
    if (key === 'template') {
      if (_.isArray(content.localizations)) {
        const name = `${content.resource}.${content.name}`
        content.localizations.forEach((l) => {
          const nodes = jp.nodes(content, '$..content'),
                { path } = nodes[0]
          nodes[0].value.forEach((cnt, i) => {
            const objectPath = _.clone(path)
            objectPath.push(i)
            objectPath.push('data')
            if (cnt.data) {
              templateFiles.push({
                name: `${name}.${l.locale}.${cnt.name}`,
                ext: TemplatesExt[cnt.name],
                data: cnt.data,
                remoteLocation: false,
                pathTo: jp.stringify(objectPath)
              })
            }
          })
        })
        privatesAccessor(this, 'templateFiles', templateFiles)
      }
    }
    return true
  }

}

class ImportSection {

  constructor(content, key = '', path = '', basePath = process.cwd()) {

    Object.assign(privatesAccessor(this), {
      content,
      key,
      path,
      basePath,
      scriptFiles: [],
      extraFiles: [],
      facets: [],
      templateFiles: []
    })
    if (new.target === ImportSection) {
      Object.seal(this)
    }
  }

  get key() {
    return privatesAccessor(this).key
  }

  get content() {
    return privatesAccessor(this).content
  }

  get facets() {
    return privatesAccessor(this).facets
  }

  get extraFiles() {
    return privatesAccessor(this).extraFiles
  }

  get scriptFiles() {
    return privatesAccessor(this).scriptFiles
  }

  get templateFiles() {
    return privatesAccessor(this).scriptFiles
  }

  getParentFromPath(path) {
    const { content } = privatesAccessor(this),
          parent = jp.parent(content, jp.stringify(path))
    if (parent.code || parent.name || parent.label || parent.resource) {
      return parent
    }
    path.pop()

    return path.length > 1 ? this.getParentFromPath(path) : {}
  }

  async loadFacets() {
    const {
      content, facets, extraFiles, basePath
    } = privatesAccessor(this)
    return new Promise(async(success) => {
      const nodes = jp.nodes(content, '$..resourceId')
      if (nodes.length) {
        _.forEach(nodes, (n) => {
          const parent = this.getParentFromPath(n.path),
                resourceKey = uuid.v4(),
                facet = Object.assign(parent, {
                  streamId: resourceKey
                })
          if (facet.filePath) {
            const asset = {
              streamId: facet.streamId,
              data: fs.readFileSync(`${basePath}${parent.filePath}`)
            }
            extraFiles.push(asset)
            delete facet.filePath
          }
          facets.push(facet)
        })
        return success()
      }
      return success()
    })
  }

  async loadScripts() {
    const { content, basePath } = privatesAccessor(this),
          nodes = jp.nodes(content, '$..script')
    nodes.forEach((n) => {
      if (!_.isObject(n.value)) {
        const parent = this.getParentFromPath(n.path)
        if (parent.script.indexOf('/env') === 0) {
          const jsFile = `${basePath}${parent.script}`
          parent.script = fs.readFileSync(jsFile).toString()
        }
      }
    })
    return true
  }

  async loadTemplates() {
    const { content, key, basePath } = privatesAccessor(this)
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

  toJSON() {
    return privatesAccessor(this)
  }

}

module.exports = {
  ExportSection,
  ImportSection,
  TemplatesExt
}
