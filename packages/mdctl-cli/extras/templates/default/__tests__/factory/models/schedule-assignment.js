import ObjectBuilder from '../base/object-builder'

export default class ScheduleAssignment extends ObjectBuilder {

  static _type() {
    return 'c_schedule_assignment'
  }

  static defaults() {
    return {}
  }

}