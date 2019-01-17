const SectionBase = require('./base')

class ViewSection extends SectionBase {

  constructor(content) {
    super(content)
    this.key = 'views'
    this.namespaces = ['/views']
    if (new.target === SectionBase) {
      Object.seal(this)
    }
  }

}

module.exports = ViewSection
