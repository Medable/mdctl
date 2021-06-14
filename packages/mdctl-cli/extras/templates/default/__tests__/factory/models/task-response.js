import ObjectBuilder from '../base/object-builder'

export default class TaskResponse extends ObjectBuilder {

  static _type() {
    return 'c_task_response'
  }
  static _defaults() {
    return {
      c_name: this.uniqueId()
    }
  }

}