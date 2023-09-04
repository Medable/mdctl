/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-undef */
/* eslint-disable no-underscore-dangle */
/* eslint-disable no-param-reassign */

const moment = require('moment')

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

    if (!studySchemaCursor.hasNext()) {
      return
    }

    memo.studySchema = studySchemaCursor.next()
  }

  before(memo) {
    if (!memo.studySchema) {
      return
    }
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

    if(!memo.studySchema) {
      return resource
    }
    // if it is the manifest we let it go as is
    if (resource.object === 'manifest') {
      memo.manifest = resource
      return resource
    }

    this.checkIfDependenciesAvailable(resource, memo)

    this.studyReferenceAdjustment(resource, memo)

    switch (resource.object) {

      case 'c_study':
        this.studyAdjustments(resource, memo)
        this.checkIfAppsAvailable(resource, memo)
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

    if (memo.study && resource.c_key !== memo.study.c_key) {
      throw Fault.create('kInvalidArgument',
        {
          errCode: 'cortex.invalidArgument.updateDisabled',
          reason: 'Study you are importing does not match the study that exists in the target org'
        })
    }

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

    const {
            // eslint-disable-next-line camelcase
            org: { objects: { ec__document_template, c_sites } }
          } = global,
          targetHasStudy = memo.study,
          studyReference = targetHasStudy && `c_study.${memo.study.c_key}`,
          studyIsDifferent = resource.ec__study !== studyReference,
          doc = ec__document_template
            .readOne({ ec__key: resource.ec__key })
            .skipAcl()
            .grant(consts.accessLevels.read)
            .throwNotFound(false)
            .paths('ec__status', 'ec__title', 'ec__key', 'ec__identifier')
            .execute(),
          { manifest } = memo

    if (doc && doc.ec__status !== 'draft') {
      throw Fault.create('kInvalidArgument',
        {
          errCode: 'cortex.invalidArgument.updateDisabled',
          reason: 'An eConsent template in this import exists in the target and is not in draft',
          message: `Template [${doc.ec__title}] ([${doc.ec__key}]) already exists in the target org and is not in DRAFT status, re-migration is not allowed`
        })
    }

    if (!doc) {
      const docWithSameIdentifier = ec__document_template
        .readOne({ ec__identifier: resource.ec__identifier })
        .skipAcl()
        .grant(consts.accessLevels.read)
        .throwNotFound(false)
        .paths('ec__key')
        .execute()

      if (docWithSameIdentifier) {
        // the last 5 digits of the ec__key to the ec__identifier to ensure unique ec__key
        resource.ec__identifier = `${resource.ec__identifier}-${resource.ec__key.slice(-5)}`
      }
    } else if (doc.ec__identifier !== resource.ec__identifier) {
      // might have same ec__key but different ec__identifier because it was initially migrated in having the same ec__key as an existing template
      // in which case, apply the target ec__identifier to the template being imported so it overwrites correctly
      resource.ec__identifier = doc.ec__identifier
    }

    if (!resource.ec__sites) {
      resource.ec__sites = []
    }

    // keep the sites that are set on the document in the target if it exists
    if (doc && doc.ec__sites) {
      resource.ec__sites.push(...doc.ec__sites)
    }
    // eslint-disable-next-line one-var
    const manifestSiteKeys = (manifest.c_site && manifest.c_site.includes) || []
    // make sure sites array only contains sites that are in the target or in the manifest
    resource.ec__sites = resource.ec__sites.filter((v) => {
      const spl = v.split('.'),
            // eslint-disable-next-line camelcase
            c_key = spl[1]
      return c_sites.find({ c_key }).skipAcl().grant(consts.accessLevels.read).hasNext() || manifestSiteKeys.includes(c_key)
    })


    // fix the study reference if necessary
    if (targetHasStudy && studyIsDifferent) {
      resource.ec__study = studyReference
    }

    // Set imported template status to draft
    // preserveTemplateStatus - will be ingected (preppended to the script file) by
    // mdctl-import-adapter during import, when the flag --preserveTemplateStatus is set to true in cli
    if (typeof preserveTemplateStatus === 'undefined' || preserveTemplateStatus === false) {
      resource.ec__status = 'draft'
    }

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
          integrationsKey = 'int__version.version',
          oracleKey = 'orac__version.version',
          workflowKey = 'workflow__version.version',
          eConsentConfig = config.get(eConsentKey),
          televisitConfig = config.get(televisitKey),
          integrationsConfig = config.get(integrationsKey),
          oracleConfig = config.get(oracleKey),
          workflowConfig = config.get(workflowKey)

    return {
      eConsentConfig,
      televisitConfig,
      integrationsConfig,
      oracleConfig,
      workflowConfig
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
          isTelevisitInstalled = !!memo.availableApps.televisitConfig,
          isIntegrationsSpecfic = resource.object.startsWith('int__'),
          isIntegrationsInstalled = !!memo.availableApps.integrationsConfig,
          isOracleSpecific = resource.object.startsWith('orac__'),
          isOracleInstalled = memo.availableApps.oracleConfig,
          isWorkflowSpecific = resource.object.startsWith('wf__'),
          isWorkflowInstalled = memo.availableApps.workflowConfig

    if (isEconsentSpecific && !isEconsentInstalled) {
      // eslint-disable-next-line no-undef
      throw Fault.create('kInvalidArgument', { reason: 'Target environment has not installed eConsent, please install eConsent and try again' })
    }

    if (isTelevisitSpecific && !isTelevisitInstalled) {
      // eslint-disable-next-line no-undef
      throw Fault.create('kInvalidArgument', { reason: 'Target environment has not installed Televisit, please install Televisit and try again' })
    }

    if (isIntegrationsSpecfic && !isIntegrationsInstalled) {
      // eslint-disable-next-line no-undef
      throw Fault.create('kInvalidArgument', { reason: 'Target environment has not installed Integrations, please install Integrations and try again' })
    }

    if (isOracleSpecific && !isOracleInstalled) {
      // eslint-disable-next-line no-undef
      throw Fault.create('kInvalidArgument', { reason: 'Target environment has not installed Oracle Integration, please install Oracle Integration and try again' })
    }
    if (isWorkflowSpecific && !isWorkflowInstalled) {
      // eslint-disable-next-line no-undef
      throw Fault.create('kInvalidArgument', { reason: 'Target environment has not installed Workflow Package, please install Workflow Package and try again' })
    }

    return true
  }

  /**
   * Returns true if the study has privacy items and all items have an app assigned
   * otherwise throws an exception
   */
  checkIfAppsAvailable(resource) {

    const hasPrivacyItems = resource.c_privacy_items && !!resource.c_privacy_items.length

    if (!hasPrivacyItems) return true

    // eslint-disable-next-line one-var
    const emptyApps = resource
      .c_privacy_items
      .find(({ c_apps: apps }) => apps && apps.length === 0)

    if (!emptyApps) return true

    // eslint-disable-next-line no-undef
    throw Fault.create('kInvalidArgument', { reason: `The Study imported has a privacy item called: '${emptyApps.c_label}' without an app assigned, assign an app, export and try again` })
  }

}
