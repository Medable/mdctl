/**
 * @fileOverview
 * @summary Implements data change request execution logic.
 * Methods from repositories should be used to interact with other services/db.
 *
 * @author Data Management Squad
 *
 * @example
 * const { DcrExecutionService } = require('dcr_intake__dcr_execution_service')
 */

const { DcrService } = require('dcr_intake__dcr_service'),
      { AutomatedChangeService } = require('dcr_intake__automated_change_service'),
      { CommentService } = require('dcr_intake__comment_service'),
      { AuthService } = require('dcr_intake__auth_service'),
      { DcrExecutionRepository } = require('dcr_intake__dcr_execution_repository')

/**
 * Data Change Request Execution Service
 *
 * @class DcrExecutionService
 */

class DcrExecutionService {

  /**
   * Create dcr execution for the logged-in user
   * @memberOf DcrExecutionService
   * @param {Object} executionInput
   * @param {Object} signInput
   * @return {String} id
   */
  static signAndExecuteForLoggedInUser(executionInput, signInput) {
    const dcr = DcrService.getById(executionInput.dcr_intake__case_id)
    CommentService.createInternalForLoggedInUser(
      dcr._id,
      `Manual change initialized. Data change request: ${JSON.stringify({
        dcr_intake__public_user_number: dcr.dcr_intake__public_user_number,
        dcr_intake__site_id: dcr.dcr_intake__site_id,
        dcr_intake__changes: executionInput.dcr_intake__changes || dcr.dcr_intake__changes
      })}.`
    )
    const signatureInput = this._prepareSignatureInput(signInput)
    let changeSummaries
    try {
      const auditMessage = AutomatedChangeService.buildAuditMessage(
        dcr._id,
        dcr.dcr_intake__number,
        dcr.dcr_intake__reason_notes || dcr.dcr_intake__reason
      )
      switch (executionInput.dcr_intake__type) {
        case DcrExecutionRepository.types.UNSET_ANCHOR_DATE_TEMPLATE:
          changeSummaries = AutomatedChangeService.removeAnchorDate({
            dcr_intake__public_user_number: dcr.dcr_intake__public_user_number,
            dcr_intake__changes: executionInput.dcr_intake__changes
          })
          break
        case DcrExecutionRepository.types.REGENERATE_ANCHOR_DATE_EVENTS:
          changeSummaries = AutomatedChangeService.addAnchorDateAndRegenerateEvents({
            dcr_intake__public_user_number: dcr.dcr_intake__public_user_number,
            dcr_intake__changes: executionInput.dcr_intake__changes
          }, auditMessage)
          break
        case DcrExecutionRepository.types.UPDATE_PARTICIPANT_ID:
          changeSummaries = AutomatedChangeService.updateParticipantId({
            dcr_intake__changes: dcr.dcr_intake__changes,
            dcr_intake__public_user_number: dcr.dcr_intake__public_user_number
          }, auditMessage)
          break
        case DcrExecutionRepository.types.INACTIVATE_PARTICIPANT:
          changeSummaries = AutomatedChangeService.inactivateParticipant({
            dcr_intake__public_user_number: dcr.dcr_intake__public_user_number
          }, auditMessage)
          break
        case DcrExecutionRepository.types.MOVE_COMPLETED_TASKS_TO_ANOTHER_VISIT:
          changeSummaries = AutomatedChangeService.moveCompletedTasksToNewVisitAndGroup({
            dcr_intake__changes: executionInput.dcr_intake__changes,
            dcr_intake__public_user_number: dcr.dcr_intake__public_user_number
          }, auditMessage)
          break
        case DcrExecutionRepository.types.UPDATE_STEP_RESPONSE:
          changeSummaries = AutomatedChangeService.updateStepResponse({
            dcr_intake__site_id: dcr.dcr_intake__site_id,
            dcr_intake__changes: executionInput.dcr_intake__changes,
            dcr_intake__public_user_number: dcr.dcr_intake__public_user_number
          }, auditMessage)
          break
        case DcrExecutionRepository.types.INACTIVATE_TASK_RESPONSE:
          changeSummaries = AutomatedChangeService.deactivateTaskResponse({
            dcr_intake__site_id: dcr.dcr_intake__site_id,
            dcr_intake__changes: executionInput.dcr_intake__changes,
            dcr_intake__public_user_number: dcr.dcr_intake__public_user_number
          }, auditMessage)
          break
        case DcrExecutionRepository.types.RESET_PATIENT_FLAG:
          changeSummaries = AutomatedChangeService.resetPatientFlag({
            dcr_intake__changes: executionInput.dcr_intake__changes,
            dcr_intake__public_user_number: dcr.dcr_intake__public_user_number
          }, auditMessage)
          break
      }
    } catch (error) {
      const { errCode, reason } = error,
            errorSummary = `Manual change failed. Error details: ${JSON.stringify({ errCode, reason })}.`
      CommentService.createInternalForLoggedInUser(dcr._id, errorSummary)
      DcrExecutionRepository.createManual({
        ...executionInput,
        dcr_intake__details: errorSummary,
        dcr_intake__status: DcrExecutionRepository.status.FAILED,
        dcr_intake__signatures: [signatureInput]
      })
      throw error
    }
    CommentService.createInternalForLoggedInUser(dcr._id, `Manual change succeeded. Executed changes: ${changeSummaries.internal}`)
    if (changeSummaries.public) {
      CommentService.createPublic(dcr._id, changeSummaries.public, {
        name: AuthService.getLoggedInAccountName(),
        email: AuthService.getLoggedInAccountEmail(),
        nameVisibility: CommentService.visibility.DATA_SERVICE_TEAM
      })
    }
    return DcrExecutionRepository.createManual({
      ...executionInput,
      dcr_intake__details: changeSummaries.internal,
      dcr_intake__status: DcrExecutionRepository.status.SUCCESS,
      dcr_intake__signatures: [signatureInput]
    })
  }

  /**
   * Prepare signature input data
   * @memberOf DcrExecutionService
   * @param {Object} signInput
   * @return {Object | undefined} signature input
   */
  static _prepareSignatureInput(signInput) {
    return {
      signer: signInput.signer,
      date: new Date()
        .toISOString(),
      value: {
        dcr_intake__signer_email: signInput.code ? AuthService.getLoggedInAccountEmail() : signInput.email,
        dcr_intake__sign_reason: 'Signing to approve execution of data change',
        dcr_intake__signature_description: signInput.code ? 'Signed with SSO Credentials' : 'Signed with password credentials'
      }
    }
  }

}

module.exports = {
  DcrExecutionService
}