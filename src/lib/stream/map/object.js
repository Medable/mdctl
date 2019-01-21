const SectionBase = require('./base')

class ObjectSection extends SectionBase {

  constructor(content) {
    super(content, 'objects', '', ['/objects'])
    if (new.target === ObjectSection) {
      Object.seal(this)
    }
  }

  validate() {
    return true
  }

}

module.exports = ObjectSection
