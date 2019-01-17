const fs = require('fs'),
      _ = require('lodash')

class SectionBase {

  constructor(content, key = '') {
    this.content = content
    this.key = key
    this.namespaces = ['']
    if (new.target === SectionBase) {
      Object.freeze(this)
    }
  }

  get name() {
    return this.key
  }

  get data() {
    if (this.content instanceof Array) {
      return _.map(this.content, c => ({ content: c, type: c.type }))
    }
    return { content: this.content, type: null }
  }

  getPath(item) {
    return `${this.namespaces[0]}/${item && item.type ? item.type : ''}`
  }

}

class EnvSection extends SectionBase {

  constructor(content) {
    super(content)
    this.key = 'env'
    if (new.target === EnvSection) {
      Object.freeze(this)
    }
  }

}

class ScriptSection extends SectionBase {

  constructor(content) {
    super(content)
    this.key = 'scripts'
    this.jsNs = '/scripts/js'
    this.namespaces = ['/scripts', this.jsNs]
    this.jsInScript = {}
    if (new.target === ScriptSection) {
      Object.freeze(this)
    }
    this.extractPaths()
    this.extractScriptCode()
  }

  extractPaths() {
    this.content.forEach((script) => {
      const path = `${this.namespaces[0]}/${script.type}`
      if (this.namespaces.indexOf(path) === -1) {
        this.namespaces.push(path)
      }
    })
  }

  extractScriptCode() {
    this.content.forEach((s) => {
      this.jsInScript[s.code] = s.script
      s.script = `#${this.jsNs}/${s.code}.js`
    })
  }

  get data() {
    const content = _.map(this.content, c => ({ content: c, type: c.type }))
    return [...content, ..._.map(this.jsInScript, (js, k) => ({
      type: 'js', name: k, format: 'js', content: js, plain: true
    }))]
  }

}

class ObjectSection extends SectionBase {

  constructor(content) {
    super(content)
    this.key = 'objects'
    this.namespaces = ['/objects']
    if (new.target === ObjectSection) {
      Object.freeze(this)
    }
  }

}

class TemplateSection extends SectionBase {

  constructor(content) {
    super(content)
    this.key = 'templates'
    this.namespaces = ['/templates']
    if (new.target === TemplateSection) {
      Object.freeze(this)
    }
    this.extractPaths()
  }

  extractPaths() {
    this.content.forEach((template) => {
      const path = `${this.namespaces[0]}/${template.type}`
      if (this.namespaces.indexOf(path) === -1) {
        this.namespaces.push(path)
      }
    })
  }

}

class ViewSection extends SectionBase {

  constructor(content) {
    super(content)
    this.key = 'views'
    this.namespaces = ['/views']
    Object.freeze(this)
  }

}

const classList = {
  env: EnvSection,
  scripts: ScriptSection,
  objects: ObjectSection,
  templates: TemplateSection,
  views: ViewSection,
}

class Section {

  constructor(key, content) {
    return new classList[key](content)
  }

}

module.exports = Section
