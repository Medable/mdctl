import ObjectBuilder from '../base/object-builder'

export default class GroupTask extends ObjectBuilder {

  static _type() {
    return 'c_group_task'
  }

  static defaults() {
    return {
      c_schedule: 'always_available'
    }
  }

}