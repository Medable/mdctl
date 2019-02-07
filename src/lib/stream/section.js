const slugify = require('slugify'),
      _ = require('lodash'),
      jp = require('jsonpath'),
      mime = require('mime'),
      pluralize = require('pluralize'),
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
      }

class SectionBase {

  constructor(content, key = '') {
    this.content = content
    this.key = key
    this.scriptFiles = []
    this.extraFiles = []
    this.templateFiles = []
    SectionsCreated.push(this)
    if (new.target === SectionBase) {
      Object.seal(this)
    }
  }

  get isCustomObject() {
    return typeof this.content.object === 'string' && (this.content.object.indexOf('c_') === 0 || this.content.object.includes('__'))
  }

  get name() {
    const { resource, object } = this.content,
          [objectName, resourceName] = (resource || object).split('.')

    if (this.key === 'env') {
      return this.key
    }
    if (MANIFEST_KEYS.keys.slice(1).indexOf(this.key) > -1) {
      return this.key.replace('manifest-', '')
    }
    return resourceName || objectName
  }

  clearScripts() {
    this.jsInScript = {}
  }

  get isWritable() {
    return NON_WRITABLE_KEYS.indexOf(this.key) < 0
  }

  getPath() {
    let path = ''
    if (ENV_KEYS.keys.indexOf(this.key) > -1) {
      path = ENV_KEYS.folder
    } else if (DATA_KEYS.keys.indexOf(this.key) > -1) {
      path = DATA_KEYS.folder
    } else if (MANIFEST_KEYS.keys.indexOf(this.key) > -1) {
      path = MANIFEST_KEYS.folder
    }
    const { object } = this.content
    if (object === 'env') {
      path = this.name
    } else if (this.isCustomObject) {
      path = `data/${pluralize(object)}`
    } else if (path) {
      path = `${path}/${pluralize(object)}`
    }
    return path
  }

  getParentFromPath(path) {
    const parent = jp.parent(this.content, jp.stringify(path))
    if (parent.code || parent.name || parent.label) {
      return parent
    }
    path.pop()
    return this.getParentFromPath(path)
  }

  extractAssets() {
    return new Promise(async(success) => {
      const nodes = jp.nodes(this.content, '$..resourceId')
      if (nodes.length) {
        _.forEach(nodes, (n) => {
          const parent = this.getParentFromPath(n.path),
                facets = _.filter(SectionsCreated, sc => sc.key === 'facet'),
                facet = _.find(facets, f => parent.resourceId === f.content.resourceId)
          if (facet) {
            const { content } = facet,
                  objectPath = jp.stringify(n.path),
                  name = `${content.resourcePath}.${slugify(content.name, '_')}`
            this.extraFiles.push({
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
    const nodes = jp.nodes(this.content, '$..script')
    nodes.forEach((n) => {
      if (!_.isObject(n.value)) {
        const path = _.clone(n.path),
              parent = this.getParentFromPath(n.path),
              type = parent.type || `${this.content.resource}.${n.path.slice(1).join('.')}`,
              name = `${type}.${slugify(parent.code || parent.name || parent.label, '_')}`
        this.scriptFiles.push({
          name,
          ext: 'js',
          data: n.value,
          remoteLocation: false,
          pathTo: jp.stringify(path)
        })
      }
    })
    return true
  }

  async extractTemplates() {
    if (this.key === 'template') {
      if (_.isArray(this.content.localizations)) {
        const name = `${this.content.resource}.${this.content.name}`
        this.content.localizations.forEach((l) => {
          const nodes = jp.nodes(this.content, '$..content'),
                { path } = nodes[0]
          nodes[0].value.forEach((cnt, i) => {
            const objectPath = _.clone(path)
            objectPath.push(i)
            objectPath.push('data')
            if (cnt.data) {
              this.templateFiles.push({
                name: `${name}.${l.locale}.${cnt.name}`,
                ext: TemplatesExt[cnt.name],
                data: cnt.data,
                remoteLocation: false,
                pathTo: jp.stringify(objectPath)
              })
            }
          })
        })
      }
    }
    return true
  }

}

module.exports = {
  Section: SectionBase,
  TemplatesExt
}
