const SectionBase = require('./base')

class TemplateSection extends SectionBase {

  constructor(content) {
    super(content, 'templates', '', ['/templates'])
    this.extractPaths()
    if (new.target === TemplateSection) {
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
