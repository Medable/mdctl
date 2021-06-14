import ObjectBuilder from '../base/object-builder'

export default class ParticipantSchedule extends ObjectBuilder {

  static _type() {
    return 'c_participant_schedule'
  }

  static defaults() {
    return {
      c_name: this.uniqueId()
    }
  }

}