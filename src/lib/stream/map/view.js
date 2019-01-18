const SectionBase = require('./base')

class ViewSection extends SectionBase {

  constructor(content) {
    super(content, 'views', '', ['/views'])
    if (new.target === ViewSection) {
      Object.seal(this)
    }
  }

}

module.exports = ViewSection
