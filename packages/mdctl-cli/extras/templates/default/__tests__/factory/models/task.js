import ObjectBuilder from '../base/object-builder'

export default class Task extends ObjectBuilder {

  static _type() {
    return 'c_task'
  }

  static defaults() {
    return {
      c_name: this.uniqueId(),
      c_type: 'survey'
    }
  }

}