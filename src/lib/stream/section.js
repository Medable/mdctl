const slugify = require('slugify'),
      _ = require('lodash'),
      jp = require('jsonpath'),
      mime = require('mime'),
      request = require('request'),
      CONFIG_KEYS = ['app', 'notification', 'policy', 'role', 'smsNumber', 'serviceAccount', 'storage', 'configuration'],
      MANIFEST_KEYS = ['manifest', 'manifest-dependencies', 'manifest-exports'],
      SectionsCreated = []

class SectionBase {

  constructor(content, key = '') {
    this.content = content
    this.key = key
    this.scriptFiles = {}
    this.extraFile = null
    SectionsCreated.push(this)
    if (new.target === SectionBase) {
      Object.seal(this)
    }
  }

  get name() {
    return this.content.name || this.content.code || this.content.object
  }

  get data() {
    return this.content
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

  downloadResources() {
    return request(this.extraFile.data)
  }

  replaceFacets() {
    return new Promise(async(success) => {
      const nodes = jp.nodes(this.content, '$..path')
      if (nodes.length) {
        const parent = this.getParentFromPath(nodes[0].path),
              facets = _.filter(SectionsCreated, sc => sc.key === 'facet'),
              facet = _.find(facets, f => parent.path === f.content.name)
        if (facet) {
          const { content } = facet
          this.extraFile = {
            name: content.name,
            facet,
            ext: mime.getExtension(content.mime),
            data: content.url || content.data,
            hasToDownload: content.url ? true : false
          }
          success()
        } else {
          return success()
        }
      }
      return success()
    })
  }

  async getScripts() {
    const nodes = jp.nodes(this.content, '$..script')
    nodes.forEach((n) => {
      if (!_.isObject(n.value)) {
        const path = jp.stringify(n.path),
              parent = this.getParentFromPath(n.path),
              name = slugify(parent.code || parent.name || parent.label, '_')
        this.scriptFiles[path] = { value: n.value, name }
        jp.value(this.content, path, `js/${name}.js`)
      }
    })
  }

}

module.exports = SectionBase
