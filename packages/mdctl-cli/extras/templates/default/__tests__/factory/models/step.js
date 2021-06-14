import ObjectBuilder from '../base/object-builder'

export default class Step extends ObjectBuilder {

  static _type() {
    return 'c_step'
  }

  static defaults() {
    return {
      c_name: this.uniqueId(),
      c_order: 0
    }
  }

}