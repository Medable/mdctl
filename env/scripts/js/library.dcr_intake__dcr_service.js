/**
 * @fileOverview
 * @summary Implements data change request logic.
 * Methods from repositories should be used to interact with other services/db.
 *
 * @author Data Management Squad
 *
 * @example
 * const { DcrService } = require('dcr_intake__dcr_service')
 */

const faults = require('c_fault_lib'),
      { AuthService } = require('dcr_intake__auth_service'),
      { AccountService } = require('dcr_intake__account_service'),
      { PublicUserRepository } = require('dcr_intake__public_user_repository'),
      { SignedCaseRepository } = require('dcr_intake__signed_case_repository'),
      { DcrExecutionRepository } = require('dcr_intake__dcr_execution_repository'),
      { CaseRepository } = require('dcr_intake__case_repository'),
      { EventRepository } = require('dcr_intake__event_repository'),
      { SiteService } = require('dcr_intake__site_service'),
      { CommentService } = require('dcr_intake__comment_service'),
      config = require('config'), 
      logger = require('logger')

/**
 * Data Change Request Service
 *
 * @class DcrService
 */
class DcrService {

  /**
   * Get dcr list for the logged-in user
   * @memberOf DcrService
   * @param {Object} params
   * @param {Number} params.limit
   * @param {Number} params.offset
   * @param {String} params.orderBy
   * @param {String} params.order
   * @param {String} params.filter
   * @return {Object} list
   */
  static listForLoggedInUser(params) {
    const siteIds = SiteService.findIdsForLoggedInUser()
    return CaseRepository.list(siteIds, params)
  }

  /**
   * Get dcr for the logged-in user
   * @memberOf DcrService
   * @param {String} caseId
   * @return {Object} dcr
   */
  static getForLoggedInUser(caseId) {
    const siteIds = SiteService.findIdsForLoggedInUser()
    if (!siteIds.length) {
      faults.throw('dcr_intake.notFound.dataChangeRequest')
    }

    const dcrCase = CaseRepository.getById(caseId)
    if (!siteIds.includes(dcrCase.dcr_intake__site_id)) {
      faults.throw('dcr_intake.notFound.dataChangeRequest')
    }

    const [signedCase] = SignedCaseRepository.findByCaseId(caseId, [
      'dcr_intake__created_by',
      'dcr_intake__closed_by',
      'dcr_intake__signatures'
    ])
    if (!signedCase) return dcrCase

    const latestSignature = this._getLatestSignatureFromSignedCase(signedCase)
    if (!latestSignature) {
      faults.throw('dcr_intake.notFound.signature')
    }

    // Salesforce Case could be closed directly on Salesforce side
    let closedBy = signedCase.dcr_intake__closed_by
    if (
      dcrCase.dcr_intake__closed_date &&
      (
        !signedCase.dcr_intake__closed_date ||
        new Date(dcrCase.dcr_intake__closed_date)
          .getTime() > new Date(signedCase.dcr_intake__closed_date)
          .getTime()
      )
    ) {
      SignedCaseRepository.updateAsClosed({
        _id: signedCase._id
      }, {
        dcr_intake__closed_date: dcrCase.dcr_intake__closed_date,
        dcr_intake__closed_by: null
      })
      closedBy = null
    }

    return {
      ...dcrCase,
      ...(dcrCase.dcr_intake__closed_date && {
        dcr_intake__closed_by: {
          email: closedBy && (!AccountService.checkIfDataServiceTeam(closedBy.roles) || AuthService.checkIfDataServiceTeam())
            ? closedBy.email : config.get('dcr_intake__default_dcr_closed_by')
        }
      }),
      dcr_intake__created_by: {
        email: signedCase.dcr_intake__created_by.email,
        c_public_identifier: signedCase.dcr_intake__created_by.c_public_identifier
      },
      dcr_intake__changes: {
        ...latestSignature.value.dcr_intake__case_details.dcr_intake__changes,
        ...dcrCase.dcr_intake__changes
      }
    }
  }

  /**
   * Get dcr by id
   * @memberOf DcrService
   * @param {String} caseId
   * @return {Object} dcr
   */
  static getById(caseId) {
    const dcrCase = CaseRepository.getById(caseId),
          signature = this._getLatestSignatureByCaseId(caseId)
    return {
      ...dcrCase,
      dcr_intake__changes: {
        ...signature.value.dcr_intake__case_details.dcr_intake__changes,
        ...dcrCase.dcr_intake__changes
      }
    }
  }

  /**
   * Create dcr for the logged-in user
   * @memberOf DcrService
   * @param {Object} dcrInput
   * @param {Object} signInput
   * @return {Object} creation result
   */
  static createForLoggedInUser(dcrInput, signInput) {
    const siteIds = SiteService.findIdsForLoggedInUser()
    if (!siteIds.includes(dcrInput.dcr_intake__site_id)) {
      faults.throw('dcr_intake.notFound.site')
    }
    const publicUserExists = PublicUserRepository.checkIfExistsByNumberAndSiteId(
      dcrInput.dcr_intake__public_user_number,
      dcrInput.dcr_intake__site_id
    )
    if (!publicUserExists) {
      faults.throw('dcr_intake.notFound.publicUser')
    }
    const createCaseResult = CaseRepository.create(dcrInput),
          signatureInput = this._prepareSignatureInput(createCaseResult.id, signInput, {
            dcr_intake__changes: dcrInput.dcr_intake__changes,
            dcr_intake__public_user_number: dcrInput.dcr_intake__public_user_number,
            dcr_intake__site_id: dcrInput.dcr_intake__site_id
          })
    SignedCaseRepository.create({
      dcr_intake__case_id: createCaseResult.id,
      dcr_intake__created_by: AuthService.getLoggedInAccountId(),
      dcr_intake__signatures: [signatureInput]
    })
    const signature = this._getLatestSignatureByCaseId(createCaseResult.id)
    CaseRepository.updateSignature(createCaseResult.id, signature._id, signature.date)
    if (this._isAutomationEnabled(dcrInput.dcr_intake__type)) {
      const dcrExecutionId = DcrExecutionRepository.createAutomated({
        dcr_intake__case_id: createCaseResult.id,
        dcr_intake__type: dcrInput.dcr_intake__type,
        dcr_intake__status: DcrExecutionRepository.status.IN_PROGRESS
      })
      EventRepository.create('dcr_intake__automated_change', createCaseResult.id, {
        executionId: dcrExecutionId
      })
    }

    return createCaseResult
  }

  /**
   * Resign dcr for the logged-in user
   * @memberOf DcrService
   * @param {String} caseId
   * @param {Object} signInput
   * @return
   */
  static resignForLoggedInUser(caseId, signInput) {
    const siteIds = SiteService.findIdsForLoggedInUser()
    if (!siteIds.length) {
      faults.throw('dcr_intake.notFound.dataChangeRequest')
    }
    const dcrCase = CaseRepository.getById(caseId)
    if (!siteIds.includes(dcrCase.dcr_intake__site_id)) {
      faults.throw('dcr_intake.notFound.dataChangeRequest')
    }
    const oldSignature = this._findLatestSignatureByCaseId(caseId),
          signatureInput = this._prepareSignatureInput(dcrCase._id, signInput, {
            dcr_intake__changes: oldSignature ? {
              ...oldSignature.value.dcr_intake__case_details.dcr_intake__changes,
              ...dcrCase.dcr_intake__changes
            } : dcrCase.dcr_intake__changes,
            dcr_intake__public_user_number: dcrCase.dcr_intake__public_user_number,
            dcr_intake__site_id: dcrCase.dcr_intake__site_id
          })
    if (oldSignature) {
      SignedCaseRepository.addSignature(AuthService.getLoggedInAccountId(), caseId, signatureInput)
    } else {
      SignedCaseRepository.create({
        dcr_intake__case_id: dcrCase._id,
        dcr_intake__created_by: AuthService.getLoggedInAccountId(),
        dcr_intake__signatures: [signatureInput]
      })
    }
    const newSignature = this._getLatestSignatureByCaseId(caseId)
    CaseRepository.updateSignature(caseId, newSignature._id, newSignature.date)
  }

  /**
   * Get dcr signature for the logged-in user
   * @memberOf DcrService
   * @param {String} caseId
   * @return {Object} signature
   */
  static getLatestSignatureForLoggedInUser(caseId) {
    const siteIds = SiteService.findIdsForLoggedInUser()
    if (!siteIds.length) {
      faults.throw('dcr_intake.notFound.dataChangeRequest')
    }
    const dcrCase = CaseRepository.getById(caseId)
    if (!siteIds.includes(dcrCase.dcr_intake__site_id)) {
      faults.throw('dcr_intake.notFound.dataChangeRequest')
    }
    return this._getLatestSignatureByCaseId(dcrCase._id)
  }

  /**
   * Prepare signature input data
   * @memberOf DcrService
   * @param {String} caseId
   * @param {Object} signInput
   * @param {Object} caseDetails
   * @return {Object} signature input
   */
  static _prepareSignatureInput(caseId, signInput, caseDetails) {
    return {
      signer: signInput.signer,
      date: new Date()
        .toISOString(),
      value: {
        dcr_intake__case_id: caseId,
        dcr_intake__case_details: caseDetails,
        dcr_intake__signer_email: signInput.code ? AuthService.getLoggedInAccountEmail() : signInput.email,
        dcr_intake__sign_reason: 'Signing to approve data change request',
        dcr_intake__signature_description: signInput.code ? 'Signed with SSO Credentials' : 'Signed with password credentials'
      }
    }
  }

  /**
   * Check if automated dcr is enabled
   * @memberOf DcrService
   * @param {String} type dcr type
   * @return {Boolean}
   */
  static _isAutomationEnabled(type) {
    const enableAutomatedChanges = config.get('dcr_intake__enable_automated_changes')

    if (!enableAutomatedChanges) return false

    const key = Object.keys(CaseRepository.types)
      .find(key => CaseRepository.types[key].includes(type.toLowerCase()))
    return enableAutomatedChanges[key]
  }

  /**
   * Get the latest signature from signed case with signatures
   * @memberOf DcrService
   * @param {Object} signedCase
   * @return {Object} signature
   */
  static _getLatestSignatureFromSignedCase(signedCase) {
    return signedCase.dcr_intake__signatures.data.sort((prev, next) => new Date(next.date) - new Date(prev.date))[0]
  }

  /**
   * Find latest signature by case id
   * @memberOf DcrService
   * @param {String} caseId
   * @return {Object} signature
   */
  static _findLatestSignatureByCaseId(caseId) {
    const [signedCase] = SignedCaseRepository.findByCaseId(caseId, ['dcr_intake__signatures'])
    if (!signedCase) return
    return this._getLatestSignatureFromSignedCase(signedCase)
  }

  /**
   * Get latest signature by case id
   * @memberOf DcrService
   * @param {String} caseId
   * @return {Object} signature
   */
  static _getLatestSignatureByCaseId(caseId) {
    const signature = this._findLatestSignatureByCaseId(caseId)
    if (!signature) {
      faults.throw('dcr_intake.notFound.signature')
    }
    return signature
  }

  /**
   * Changes dcr status for the logged-in user
   * @memberOf DcrService
   * @param {String} salesforceCaseId
   * @param {String} status
   */
  static changeStatusForLoggedInUser(salesforceCaseId, status) {
    const dcr = CaseRepository.getById(salesforceCaseId)
    if (dcr.dcr_intake__status === CaseRepository.statuses.CLOSED ||
      dcr.dcr_intake__status === status) {
      faults.throw('dcr_intake.accessDenied.updateForbidden')
    }
    CaseRepository.updateStatus(dcr._id, status)
    if (status === CaseRepository.statuses.CLOSED) {
      SignedCaseRepository.updateAsClosed({
        dcr_intake__case_id: dcr._id
      }, {
        dcr_intake__closed_by: AuthService.getLoggedInAccountId()
      })
    }
    CommentService.createPublic(
      dcr._id,
      `Status was changed from ${dcr.dcr_intake__status} to ${status}`,
      {
        name: AuthService.getLoggedInAccountName(),
        email: AuthService.getLoggedInAccountEmail(),
        nameVisibility: CommentService.visibility.DATA_SERVICE_TEAM
      })
  }

}

module.exports = {
  DcrService
}