const slugify = require('slugify'),
      _ = require('lodash'),
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
      TEMPLATES_EXT = {
        email: {
          html: 'html',
          plain: 'txt',
          subject: 'txt'
        },
        push: {
          message: 'txt'
        },
        sms: {
          message: 'txt'
        }
      },
      NON_WRITABLE_KEYS = ['facet'],
      SectionsCreated = [],
      { privatesAccessor } = require('../privates')

class ExportSection {

  constructor(content, key = '') {

    Object.assign(privatesAccessor(this), {
      content,
      key,
      scriptFiles: [],
      extraFiles: [],
      templateFiles: [],
      id: uuid.v4()
    })
    if (new.target === ExportSection) {
      Object.seal(this)
    }
    if (this.isWritable) {
      SectionsCreated.push(this)
    }
  }

  get id() {
    return privatesAccessor(this).id
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
          { resource, object, label } = content,
          [objectName, resourceName] = (resource || object).split('.')

    if (key === 'env') {
      return key
    }
    if (MANIFEST_KEYS.keys.slice(1).indexOf(key) > -1) {
      return key.replace('manifest-', '')
    }
    return label ? slugify(label, '_') : resourceName || objectName
  }

  get isWritable() {
    return NON_WRITABLE_KEYS.indexOf(privatesAccessor(this).key) < 0
  }

  get isFacet() {
    return privatesAccessor(this).key === 'facet'
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
    const facet = privatesAccessor(this).content
    let itemSource = null
    for (let i = 0; i < SectionsCreated.length; i += 1) {
      const sc = SectionsCreated[i],
            nodes = jp.nodes(sc.content, '$..resourceId'),
            item = _.find(nodes, n => n.value === facet.resourceId)
      if (item) {
        // replace last path
        const ETagPathItem = _.clone(item.path)
        item.path.splice(item.path.length - 1, 1, 'filePath')
        ETagPathItem.splice(ETagPathItem.length - 1, 1, 'ETag')
        itemSource = {
          sectionId: sc.id,
          sectionName: sc.name,
          path: jp.stringify(item.path),
          pathETag: jp.stringify(ETagPathItem)
        }
        break
      }
    }
    if (itemSource !== null) {
      const {
        url, base64, streamId, path
      } = facet
      privatesAccessor(this).extraFiles.push({
        name: facet.resource,
        ext: mime.getExtension(facet.mime),
        url,
        base64,
        streamId,
        path,
        remoteLocation: !!facet.url,
        sectionId: itemSource.sectionId,
        sectionName: itemSource.sectionName,
        pathTo: itemSource.path,
        ETag: facet.ETag,
        PathETag: itemSource.pathETag
      })
    }
  }

  extractScripts() {
    const { content } = privatesAccessor(this),
          nodes = jp.nodes(content, '$..script')
    nodes.forEach((n) => {
      if (!_.isObject(n.value)) {
        const path = _.clone(n.path),
              parent = this.getParentFromPath(n.path),
              type = parent.type || `${content.resource}.${n.path.slice(1).join('.')}`,
              name = `${type}.${slugify(parent.code || parent.name || parent.label, '_')}`
        privatesAccessor(this).scriptFiles.push({
          name,
          ext: 'js',
          data: n.value,
          remoteLocation: false,
          pathTo: jp.stringify(path),
          sectionId: this.id
        })
      }
    })
  }

  extractTemplates() {
    const { key, content } = privatesAccessor(this)
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
              privatesAccessor(this).templateFiles.push({
                name: `${name}.${l.locale}.${cnt.name}`,
                ext: TEMPLATES_EXT[content.type][cnt.name],
                data: cnt.data,
                remoteLocation: false,
                pathTo: jp.stringify(objectPath),
                sectionId: this.id
              })
            }
          })
        })
      }
    }
  }

  toJSON() {
    return privatesAccessor(this)
  }

}

class StreamChunk {

  constructor(content, key = '') {
    Object.assign(privatesAccessor(this), {
      content,
      key,
      id: uuid.v4()
    })
    if (new.target === StreamChunk) {
      Object.seal(this)
    }
  }

  get id() {
    return privatesAccessor(this).id
  }

  get key() {
    return privatesAccessor(this).key
  }

  get content() {
    return privatesAccessor(this).content
  }

  toJSON() {
    return privatesAccessor(this)
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

  toJSON() {
    return privatesAccessor(this)
  }

}

module.exports = {
  ExportSection,
  StreamChunk,
  ImportSection
}
