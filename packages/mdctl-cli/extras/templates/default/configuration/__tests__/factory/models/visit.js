import ObjectBuilder from '../base/object-builder'

export default class Visit extends ObjectBuilder {

  static _type() {
    return 'c_visit'
  }

  static defaults() {
    return {
      c_name: this.uniqueId()
    }
  }

}