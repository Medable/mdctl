const slugify = require('slugify'),
      _ = require('lodash'),
      jp = require('jsonpath'),
      CONFIG_KEYS = ['app', 'notification', 'policy', 'role', 'smsNumber', 'serviceAccount', 'storage', 'configuration'],
      MANIFEST_KEYS = ['manifest', 'manifest-dependencies', 'manifest-exports']

class SectionBase {

  constructor(content, key = '', jsNs = 'js') {
    this.content = content
    this.key = key
    this.jsNs = jsNs
    this.jsInScript = {}
    this.extractScriptCode()
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

  extractScriptCode() {
    const nodes = jp.nodes(this.content, '$..script')
    nodes.forEach((n) => {
      if (!_.isObject(n.value)) {
        const path = jp.stringify(n.path),
              parent = this.getParentFromPath(n.path),
              name = slugify(parent.code || parent.name || parent.label, '_')
        this.jsInScript[path] = { value: n.value, name }
        jp.value(this.content, path, `#${this.jsNs}/${name}.js`)
      }
    })
  }

}

module.exports = SectionBase
