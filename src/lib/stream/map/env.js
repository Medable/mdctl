const SectionBase = require('./base')

class EnvSection extends SectionBase {

  constructor(content) {
    super(content, 'env', '/js', [''])
    if (new.target === EnvSection) {
      Object.seal(this)
    }
  }

}

module.exports = EnvSection
