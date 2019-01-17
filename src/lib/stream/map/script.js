const SectionBase = require('./base')

class ScriptSection extends SectionBase {

  constructor(content) {
    super(content)
    this.key = 'scripts'
    this.jsNs = '/scripts/js'
    this.namespaces = ['/scripts', this.jsNs]
    this.extractPaths()
    if (new.target === SectionBase) {
      Object.seal(this)
    }
  }

  extractPaths() {
    this.content.forEach((script) => {
      const path = `${this.namespaces[0]}/${script.type}`
      if (this.namespaces.indexOf(path) === -1) {
        this.namespaces.push(path)
      }
    })
  }

}

module.exports = ScriptSection
