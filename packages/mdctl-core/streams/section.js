const _ = require('lodash'),
      jp = require('jsonpath'),
      mime = require('mime'),
      uuid = require('uuid'),
      pluralize = require('pluralize'),
      { isCustomName, isInteger } = require('@medable/mdctl-core-utils/values'),
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
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates')

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
      delete this.content.resource
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
          { name, code, object } = content

    if (key === 'env') {
      return key
    }
    if (MANIFEST_KEYS.keys.slice(1).indexOf(key) > -1) {
      return key.replace('manifest-', '')
    }
    if (key === 'role') {
      return code || name || object
    }
    return name || object
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
    if (parent.code || isCustomName(parent.name)) {
      return parent
    }
    path.pop()
    return this.getParentFromPath(path)
  }

  getNameFromPath(path) {
    const { content } = privatesAccessor(this),
          pathAcc = []
    path.forEach((p) => {
      if (isInteger(p)) {
        const currentPath = _.clone(pathAcc)
        currentPath.push(p)
        const currentItem = jp.value(content, jp.stringify(currentPath))
        if (currentItem && (currentItem.code || isCustomName(currentItem.name))) {
          pathAcc.push(currentItem.code || currentItem.name)
        } else {
          pathAcc.push(p)
        }
      } else if (p !== '$') {
        pathAcc.push(p)
      }
    })
    return pathAcc.join('.')
  }


  cleanProps(sc, itemPath) {
    itemPath.pop()
    itemPath.push('resourceId')
    const facetItem = jp.parent(sc.content, jp.stringify(itemPath))
    if (facetItem) {
      delete facetItem.resourceId
    }
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
        this.cleanProps(sc, _.clone(item.path))
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
              namePath = this.getNameFromPath(path),
              items = []

        // skip validators
        if (namePath.indexOf('.validators.') > -1) {
          return
        }
        if (content.object === 'script') {
          const parent = this.getParentFromPath(_.clone(n.path))
          if (parent && parent.type) {
            items.push(parent.type)
          }
        } else {
          items.push(content.object)
        }
        items.push(content.name || content.code)
        if (namePath.indexOf('.') > -1) {
          items.push(namePath)
        }
        privatesAccessor(this).scriptFiles.push({
          name: items.join('.'),
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
        const name = `${content.object}.${content.type}.${content.name}`
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
