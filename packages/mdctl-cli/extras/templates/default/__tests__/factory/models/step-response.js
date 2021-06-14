import ObjectBuilder from '../base/object-builder'

export default class StepResponse extends ObjectBuilder {

  static _type() {
    return 'c_step_response'
  }

  static _defaults() {
    return {
      c_name: this.uniqueId()
    }
  }

}