const slugify = require('slugify'),
      _ = require('lodash'),
      jp = require('jsonpath'),
      mime = require('mime'),
      CONFIG_KEYS = ['app', 'notification', 'policy', 'role', 'smsNumber', 'serviceAccount', 'storage', 'configuration'],
      MANIFEST_KEYS = ['manifest', 'manifest-dependencies', 'manifest-exports'],
      NON_WRITABLE_KEYS = ['facet'],
      SectionsCreated = []

class SectionBase {

  constructor(content, key = '') {
    this.content = content
    this.key = key
    this.scriptFiles = []
    this.extraFiles = []
    if (CONFIG_KEYS.indexOf(this.key) > -1) {
      this.sectionKey = `env.extras.${this.key}`
    }
    this.writable = NON_WRITABLE_KEYS.indexOf(this.key) < 0
    SectionsCreated.push(this)
    if (new.target === SectionBase) {
      Object.seal(this)
    }
  }

  get name() {
    return this.content.name || this.content.code || this.content.object
  }

  clearScripts() {
    this.jsInScript = {}
  }

  getPath() {
    let path = this.content.object
    if (CONFIG_KEYS.indexOf(this.key) > -1) {
      path = `env/${this.content.object}`
    } else if (MANIFEST_KEYS.indexOf(this.key) > -1) {
      path = 'manifest/'
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
      const nodes = jp.nodes(this.content, '$..path')
      if (nodes.length) {
        _.forEach(nodes, (n) => {
          const parent = this.getParentFromPath(n.path),
                facets = _.filter(SectionsCreated, sc => sc.key === 'facet'),
                facet = _.find(facets, f => parent.path === f.content.name)
          if (facet) {
            const { content } = facet,
                  objectPath = jp.stringify(n.path),
                  name = `${content.name}.${slugify(this.content.name, '_')}.${this.content.locale}`
            this.extraFiles.push({
              name,
              facet,
              ext: mime.getExtension(content.mime),
              data: content.url || content.data,
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
        const parent = this.getParentFromPath(n.path),
              name = `${parent.type}.${slugify(parent.code || parent.name || parent.label, '_')}`
        this.scriptFiles.push({
          name,
          ext: 'js',
          data: n.value,
          remoteLocation: false,
          pathTo: jp.stringify(n.path)
        })
      }
    })
    return true
  }

}

module.exports = SectionBase
