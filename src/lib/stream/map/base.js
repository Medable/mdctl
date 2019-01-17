const slugify = require('slugify'),
      _ = require('lodash'),
      jp = require('jsonpath')

class SectionBase {

  constructor(content, key = '') {
    this.content = content
    this.key = key
    this.jsNs = ''
    this.namespaces = ['', this.jsNs]
    this.jsInScript = {}
    this.extractScriptCode()
    if (new.target === SectionBase) {
      Object.seal(this)
    }
  }

  get name() {
    return this.key
  }

  get data() {
    if (this.content instanceof Array) {
      return [
        ..._.map(this.content, c => ({ content: c, type: c.type })),
        ..._.map(this.jsInScript, js => ({
          type: 'js', name: js.name, format: 'js', content: js.value, plain: true
        }))]
    }
    return [
      { content: this.content, type: null, name: this.key },
      ..._.map(this.jsInScript, js => ({
        type: 'js', name: js.name, format: 'js', content: js.value, plain: true
      }))]
  }

  clearScripts() {
    this.jsInScript = {}
  }

  getPath(item) {
    return `${this.namespaces[0]}/${item && item.type ? item.type : ''}`
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
