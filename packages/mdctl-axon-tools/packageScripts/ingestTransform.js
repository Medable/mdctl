/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-undef */
/* eslint-disable no-underscore-dangle */
/* eslint-disable no-param-reassign */

import moment from 'moment'

// eslint-disable-next-line import/no-unresolved
const { Transform } = require('runtime.transform')
// eslint-disable-next-line import/no-unresolved
const config = require('config')

module.exports = class extends Transform {

  beforeAll(memo) {
    const {
            // eslint-disable-next-line camelcase
            org: { objects: { object, c_sites } }
          } = global,

          studySchemaCursor = object
            .find({ name: 'c_study' })
            .skipAcl()
            .grant('read')
            .paths('properties.name')

    memo.availableApps = this.getAvailableApps()

    if (!studySchemaCursor.hasNext()) return

    memo.studySchema = studySchemaCursor.next()
    memo.c_sties = c_sites.find()
      .skipAcl()
      .grant(consts.accessLevels.read)
      .paths('c_key')
      .toArray()
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
        this.econsentDocumentTemplateAdjustments(resource, memo)
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
  econsentDocumentTemplateAdjustments(resource, memo) {

    const doc = global
      .org
      .objects
      .ec__document_template
      .readOne({ ec__key: resource.ec__key })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .throwNotFound(false)
      .paths('ec__status', 'ec__title', 'ec__key')
      .execute()

    if (doc && doc.ec__status !== 'draft') {
      throw Fault.create('kInvalidArgument',
        {
          errCode: 'cortex.invalidArgument.updateDisabled',
          reason: 'An eConsent template in this import exists in the target and is not in draft',
          message: `Document Key ${doc.ec__key}, Document title "${doc.ec__title}"`,
          resource
        })
    }

    const studySites = memo.c_sites.map(v => `c_site.${v._c_key}`)

    // keep the sites that are set on the document in the target if it exists
    if (doc && doc.ec__sites) {
      resource.ec__sites.push(...doc.ec__sites)
    }

    // make sure sites array only contains sites that are in the target
    resource.c_sites = resource.ec__sites.filter(v => studySites.includes(v))


    // importing a new published doc? Set the published date as today.
    if (!doc && resource.ec__status === 'published') {
      resource.ec__published = moment().format('YYYY-MM-DD')
    }
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
