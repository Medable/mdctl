import ObjectBuilder from '../base/object-builder'

export default class Study extends ObjectBuilder {

  static _type() {
    return 'c_study'
  }

  static defaults() {
    return {
      c_name: this.uniqueId()
    }
  }

}