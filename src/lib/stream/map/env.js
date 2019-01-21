const SectionBase = require('./base')

class EnvSection extends SectionBase {

  constructor(content) {
    super(content, 'env', '/js', [''])
    this.childrenProps = ['apps', 'policies', 'roles', 'notifications', 'smsNumbers', 'serviceAccounts', 'storage', 'configuration']
    if (new.target === EnvSection) {
      Object.seal(this)
    }
  }

  validate() {
    const keys = Object.keys(this.content),
          intersection = keys.filter(x => !this.childrenProps.includes(x))
    return intersection.length === 0
  }

}

module.exports = EnvSection
