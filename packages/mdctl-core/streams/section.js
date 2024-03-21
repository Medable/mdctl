const _ = require('lodash'),
      jp = require('jsonpath'),
      mime = require('mime'),
      uuid = require('uuid'),
      pluralize = require('pluralize'),
      { isCustomName, isInteger } = require('@medable/mdctl-core-utils/values'),
      ENV_KEYS = {
        keys: ['app', 'config', 'notification', 'policy', 'role', 'smsNumber', 'serviceAccount', 'storageLocation', 'configuration', 'template', 'object', 'script', 'view', 'i18n', 'expression'],
        folder: 'env'
      },
      DATA_KEYS = {
        keys: [''],
        folder: 'data'
      },
      MANIFEST_KEYS = {
        keys: ['manifest', 'manifest-dependencies', 'manifest-exports', 'resources'],
        folder: ''
      },
      TEMPLATES_EXT = {
        email: {
          html: 'html',
          plain: 'txt',
          subject: 'txt',
          partial: 'html'
        },
        push: {
          message: 'txt',
          partial: 'txt'
        },
        sms: {
          message: 'txt',
          partial: 'txt'
        },
        html: {
          content: 'html',
          partial: 'html'
        },
      },
      NON_WRITABLE_KEYS = ['facet'],
      sectionsWithResources = [],
      { privatesAccessor } = require('@medable/mdctl-core-utils/privates'),
      crypto = require('crypto')

class ExportSection {

  constructor(content, key = '') {

    Object.assign(privatesAccessor(this), {
      content,
      key,
      scriptFiles: [],
      extraFiles: [],
      templateFiles: [],
      resourcePaths: [],
      id: uuid.v4()
    })
    if (new.target === ExportSection) {
      Object.seal(this)
    }
    if (this.isWritable) {
      const nodes = jp.nodes(content, '$..resourceId')
      if (nodes.length > 0) {
        privatesAccessor(this).resourcePaths.push(...nodes)
        sectionsWithResources.push(this)
      }
    }
  }

  static clearSectionsWithResources() {
    sectionsWithResources.length = 0
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

  get resourcePaths() {
    return privatesAccessor(this).resourcePaths
  }

  get name() {
    const { content, key } = privatesAccessor(this),
          {
            name, code, object, resource
          } = content

    if (key === 'env') {
      return key
    }
    if (MANIFEST_KEYS.keys.slice(1).indexOf(key) > -1) {
      return key.replace('manifest-', '')
    }
    if (key === 'role') {
      return code || name || object
    }
    if (key === 'template') {
      return `${content.type}.${name || object}`
    }
    if (!name && resource && isCustomName(object)) {
      return resource.replace(`${object}.`, '')
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
    for (let i = 0; i < sectionsWithResources.length; i += 1) {
      const sc = sectionsWithResources[i],
            item = _.find(sc.resourcePaths, n => n.value === facet.resourceId)
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

    // Exclude script extraction to all instance data.
    if (isCustomName(content.object)) {
      return
    }

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
        content.localizations.forEach((l, locIdx) => {
          let localeInName
          if (_.isArray(l.locale)) {
            if (l.locale.length > 1) {
              localeInName = crypto.createHash('md5').update(l.locale.join()).digest('hex')
            } else if (_.isEqual(l.locale, ['*'])) {
              localeInName = 'anyLocale'
            } else {
              localeInName = l.locale[0]
            }
          } else {
            localeInName = l.locale
          }

          const nodes = jp.nodes(l, '$..content')
          nodes.forEach((n) => {
            const parentPath = ['$', 'localizations', locIdx]
            n.value.forEach((cnt, i) => {
              const path = _.clone(n.path)
              path.shift()
              const objectPath = _.clone(_.concat(parentPath, path))
              objectPath.push(i)
              objectPath.push('data')
              if (cnt.data) {
                privatesAccessor(this).templateFiles.push({
                  name: `${name}.${localeInName}.${cnt.name}`,
                  ext: TEMPLATES_EXT[content.type][cnt.name],
                  data: cnt.data,
                  remoteLocation: false,
                  pathTo: jp.stringify(objectPath),
                  sectionId: this.id
                })
              }
            })
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
