import ObjectBuilder from '../base/object-builder'

export default class Query extends ObjectBuilder {

  static _type() {
    return 'c_query'
  }

  static defaults() {
    return {
      c_type: 'blah'
    }
  }

}