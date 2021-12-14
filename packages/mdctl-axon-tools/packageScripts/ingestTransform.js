/* eslint-disable no-param-reassign */
// eslint-disable-next-line import/no-unresolved
const { Transform } = require('runtime.transform')

module.exports = class extends Transform {

  beforeAll(memo) {

    const {
      // eslint-disable-next-line camelcase
      org: { objects: { c_study } }
    } = global

    // eslint-disable-next-line no-param-reassign
    memo.study = c_study
      .find()
      .skipAcl()
      .grant('public')
      .paths('_id', 'c_name', 'c_key')
      .next()
  }

  each(resource, memo) {

    this.generalAdjustments(resource, memo)

    switch (resource.object) {

      case 'c_study':
        this.studyAdjustments(resource)
        break

      case 'ec__document_template':
        this.econsentDocumentTemplateAdjustments(resource)
        break

      default:
        break
    }

    return resource
  }

  generalAdjustments(resource, memo) {

    const studyReference = `c_study.${memo.study.c_key}`,
          hasStudyReference = !!resource.c_study,
          isDifferent = resource.c_study !== studyReference

    if (hasStudyReference && isDifferent) {
      resource.c_study = `c_study.${memo.study.c_key}`
    }

  }

  /**
   * Add modifications to the c_study object
   * @param {*} resource
   */
  studyAdjustments(resource) {

    // eslint-disable-next-line no-prototype-builtins
    if (!resource.hasOwnProperty('c_no_pii')) {
      resource.c_no_pii = false
    }

  }

  /**
   * Add modifications to the ec__document_template object
   * @param {*} resource
   */
  econsentDocumentTemplateAdjustments(resource) {
    resource.c_sites = []

    if (resource.ec__published) {
      delete resource.ec__published
    }

    resource.ec__status = 'draft'
  }

}
