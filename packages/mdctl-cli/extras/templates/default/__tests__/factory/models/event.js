import ObjectBuilder from '../base/object-builder'

export default class EventTemplate extends ObjectBuilder {

  static _type() {
    return 'c_event'
  }

  static defaults() {
    return {}
  }

}