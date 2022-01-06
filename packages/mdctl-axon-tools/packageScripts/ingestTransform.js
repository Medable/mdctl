/* eslint-disable no-param-reassign */
// eslint-disable-next-line import/no-unresolved
const { Transform } = require('runtime.transform')
// eslint-disable-next-line import/no-unresolved
const config = require('config')

module.exports = class extends Transform {

  beforeAll(memo) {
    const {
            // eslint-disable-next-line camelcase
            org: { objects: { object } }
          } = global,

          studySchemaCursor = object
            .find({ name: 'c_study' })
            .skipAcl()
            .grant('read')
            .paths('properties.name')

    memo.availableApps = this.getAvailableApps()

    if (!studySchemaCursor.hasNext()) return

    memo.studySchema = studySchemaCursor.next()
  }

  before(memo) {
    const {
      // eslint-disable-next-line camelcase
      org: { objects: { c_study } }
    } = global

    if (memo.study) return

    // eslint-disable-next-line one-var
    const studyCursor = c_study
      .find()
      .skipAcl()
      .grant('public')
      .paths('_id', 'c_name', 'c_key')

    if (!studyCursor.hasNext()) return

    memo.study = studyCursor.next()
  }

  each(resource, memo) {

    // if it is the manifest we let it go as is
    if (resource.object === 'manifest') return resource

    this.checkIfDependenciesAvailable(resource, memo)

    this.studyReferenceAdjustment(resource, memo)

    switch (resource.object) {

      case 'c_study':
        this.studyAdjustments(resource, memo)
        break

      case 'ec__document_template':
        this.econsentDocumentTemplateAdjustments(resource)
        break

      default:
        break
    }

    return resource
  }

  /**
   * When an object has a study reference and the study
   * object is not exported (for example when exporting tasks only)
   * apply the reference from the memo
   * @param {*} resource
   * @param {*} memo
   */
  studyReferenceAdjustment(resource, memo) {

    if (!memo.study) return

    const studyReference = `c_study.${memo.study.c_key}`,
          // eslint-disable-next-line no-prototype-builtins
          hasStudyReference = resource.hasOwnProperty('c_study'),
          isDifferent = resource.c_study !== studyReference

    if (hasStudyReference && isDifferent) {
      resource.c_study = `c_study.${memo.study.c_key}`
    }
  }

  /**
   * Add modifications to the c_study object
   * @param {*} resource
   */
  studyAdjustments(resource, memo) {

    // eslint-disable-next-line no-prototype-builtins
    if (!resource.hasOwnProperty('c_no_pii')) {

      const hasNoPiiProp = memo
        .studySchema
        .properties
        .find(({ name }) => name === 'c_no_pii')

      if (hasNoPiiProp) resource.c_no_pii = false
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

  /**
   * Returns a list of available applications in the target environment
   */
  getAvailableApps() {
    const eConsentKey = 'ec__version.version',
          televisitKey = 'tv__config.version',
          eConsentConfig = config.get(eConsentKey),
          televisitConfig = config.get(televisitKey)

    return {
      eConsentConfig,
      televisitConfig
    }
  }

  /**
   * Returns true if the dependencies for the resource to import are met
   * otherwise throws an exception
   */
  checkIfDependenciesAvailable(resource, memo) {

    const isEconsentSpecific = resource.object.startsWith('ec__'),
          isEconsentInstalled = !!memo.availableApps.eConsentConfig,
          isTelevisitSpecific = resource.object.startsWith('tv__'),
          isTelevisitInstalled = !!memo.availableApps.televisitConfig

    if (isEconsentSpecific && !isEconsentInstalled) {
      // eslint-disable-next-line no-undef
      throw Fault.create('kInvalidArgument', { reason: 'Target environment has not installed eConsent, please install eConsent and try again' })
    }

    if (isTelevisitSpecific && !isTelevisitInstalled) {
      // eslint-disable-next-line no-undef
      throw Fault.create('kInvalidArgument', { reason: 'Target environment has not installed Televisit, please install Televisit and try again' })
    }

    return true
  }

}
