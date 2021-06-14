import ObjectBuilder from '../base/object-builder'

export default class AnchorDateTemplate extends ObjectBuilder {

  static _type() {
    return 'c_anchor_date_template'
  }

  static defaults() {
    return {
      c_identifier: 'An Anchor Date',
      c_type: 'Manual'
    }
  }

}