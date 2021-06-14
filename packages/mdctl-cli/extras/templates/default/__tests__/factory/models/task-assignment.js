import ObjectBuilder from '../base/object-builder'

export default class TaskAssignment extends ObjectBuilder {

  static _type() {
    return 'c_task_assignment'
  }

  static defaults() {
    return {
      type: 'c_ad_hoc_assignment'
    }
  }

}