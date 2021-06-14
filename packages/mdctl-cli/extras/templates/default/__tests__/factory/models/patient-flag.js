import ObjectBuilder from '../base/object-builder'

export default class PatientFlag extends ObjectBuilder {

  static _type() {
    return 'c_patient_flag'
  }

  static defaults() {
    return {
      c_identifier: this.uniqueId()
    }
  }

}