const SectionBase = require('./base')

class EnvSection extends SectionBase {

  constructor(content) {
    super(content)
    this.key = 'env'
    this.jsNs = '/js'
    this.namespaces = ['', this.jsNs]
    if (new.target === SectionBase) {
      Object.seal(this)
    }
  }

}

module.exports = EnvSection
