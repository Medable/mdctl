import ObjectBuilder from '../base/object-builder'

export default class Group extends ObjectBuilder {

  static _type() {
    return 'c_group'
  }

  static defaults() {
    return {
      c_name: this.uniqueId()
    }
  }

}