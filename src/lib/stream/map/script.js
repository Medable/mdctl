const SectionBase = require('./base')

class ScriptSection extends SectionBase {

  constructor(content) {
    super(content, 'scripts', '/scripts/js', ['/scripts'])
    this.extractPaths()
    if (new.target === ScriptSection) {
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

  validate() {
    return true
  }

}

module.exports = ScriptSection
