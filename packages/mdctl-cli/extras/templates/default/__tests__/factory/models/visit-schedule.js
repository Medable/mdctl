import ObjectBuilder from '../base/object-builder'

export default class VisitSchedule extends ObjectBuilder {

  static _type() {
    return 'c_visit_schedule'
  }

  static defaults() {
    return {
      c_name: this.uniqueId()
    }
  }

}