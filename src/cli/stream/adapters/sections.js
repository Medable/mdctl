const fs = require('fs')

class SectionBase {

  constructor(content, key = '') {
    this.content = content
    this.key = key
    if (new.target === SectionBase) {
      Object.freeze(this)
    }
  }

  get name() {
    return this.key
  }

}

class EnvSection extends SectionBase {

  constructor(content) {
    super(content)
    this.key = 'env'
    this.namespace = ['']
    if (new.target === EnvSection) {
      Object.freeze(this)
    }
  }

}

class ScriptSection extends SectionBase {

  constructor(content) {
    super(content)
    this.key = 'scripts'
    this.namespaces = ['/scripts', '/scripts/js']
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
      if(this.namespaces.indexOf(path) === -1) {
        this.namespaces.push(path)
      }
    })
  }

  extractScriptCode() {
    this.content.forEach((script) => {
      this.jsInScript[script.code] = script.script
    })
  }

  get jsScripts() {
    return this.jsInScript
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
      if(this.namespaces.indexOf(path) === -1) {
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
