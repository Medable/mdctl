const SectionBase = require('./base')

class ObjectSection extends SectionBase {

  constructor(content) {
    super(content)
    this.key = 'objects'
    this.namespaces = ['/objects']
    if (new.target === SectionBase) {
      Object.seal(this)
    }
  }

}

module.exports = ObjectSection
