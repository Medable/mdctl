const SectionBase = require('./base')

class TemplateSection extends SectionBase {

  constructor(content) {
    super(content)
    this.key = 'templates'
    this.namespaces = ['/templates']
    this.extractPaths()
    if (new.target === SectionBase) {
      Object.seal(this)
    }
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

module.exports = TemplateSection
