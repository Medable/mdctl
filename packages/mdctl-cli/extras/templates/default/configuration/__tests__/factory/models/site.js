import ObjectBuilder from '../base/object-builder'

export default class Site extends ObjectBuilder {

  static _type() {
    return 'c_site'
  }

  static defaults() {
    return {
      c_name: `Site ${this.uniqueId()}`,
      c_number: `S-${this.uniqueId()}`
    }
  }

}