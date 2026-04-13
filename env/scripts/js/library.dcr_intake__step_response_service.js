/**
 * @fileOverview
 * @summary Implements step response related logic.
 * Methods from repositories should be used to interact with other services/db.
 *
 * @author Data Management Squad
 *
 * @example
 * const { StepResponseService } = require('dcr_intake__step_response_service')
 */

const { StepResponseRepository } = require('dcr_intake__step_response_repository'),
      { AccountService } = require('dcr_intake__account_service'),
      { AuthService } = require('dcr_intake__auth_service'),
      { SiteService } = require('dcr_intake__site_service'),
      { BranchingLogicService } = require('dcr_intake__branching_logic_service'),
      faults = require('c_fault_lib'),
      logger = require('logger')

/**
 * Step Response Service
 *
 * @class StepResponseService
 */

class StepResponseService {

  /**
   * @memberOf StepResponseService
   * @param {Object=} filters
   * @param {String[]=} expand
   * @return {Object[]} step responses
   */
  static findForLoggedInUser(filters = {}, expand = []) {
    const siteIds = SiteService.findIdsForLoggedInUser(),
          stepResponses = StepResponseRepository.findForSiteIds(siteIds, filters, [...expand, 'creator']),
          isAccessible = AuthService.roleGroups.DATA_SERVICE_TEAM_ONLY.includes(AuthService.getLoggedInAccountRole())
    return stepResponses
      .reduce((result, stepResponse) => {
        const { creator, ...stepResponseWithoutCreator } = stepResponse
        if (isAccessible || !AccountService.checkIfPatient(creator.roles)) {
          result.push(stepResponseWithoutCreator)
        }
        return result
      }, [])
  }

  /**
   * Get screens/steps for a task response
   * @memberOf StepResponseService
   * @param {String} taskResponseId Task response ID
   * @return {Object[]} Array of screens/steps for the task response
   */
  static getScreensForTaskResponse(taskResponseId) {
    try {
      const siteIds = SiteService.findIdsForLoggedInUser()
      const filters = { c_task_response: taskResponseId }
      const expand = ['c_step']
      
      const stepResponses = StepResponseRepository.findForSiteIds(siteIds, filters, expand)
      const branchingLogicAffectedSteps = BranchingLogicService.getAffectedStepsForChange(taskResponseId)
      const branchingLogicAffectedStepIds = branchingLogicAffectedSteps.affectedSteps.map(affectedStep => String(affectedStep.stepId))
      
      // Format step responses as screens for the frontend
      return stepResponses.map(stepResponse => ({
        id: stepResponse._id,
        stepId: stepResponse._id,
        stepResponseId: stepResponse._id,
        name: stepResponse.c_step && stepResponse.c_step.c_name || 'Unknown Step',
        label: `${stepResponse.c_step && stepResponse.c_step.c_order || ''}. ${stepResponse.c_step && stepResponse.c_step.c_name || 'Unknown Step'}`,
        question: (stepResponse.c_step && stepResponse.c_step.c_question) || (stepResponse.c_step && stepResponse.c_step.c_text) || 'No question text',
        type: stepResponse.c_step && stepResponse.c_step.c_type || 'text',
        order: stepResponse.c_step && stepResponse.c_step.c_order || 0,
        originalValue: stepResponse.c_original_value || stepResponse.c_value || '',
        stepKey: stepResponse.c_step && stepResponse.c_step.c_key || '',
        screen: stepResponse.c_step && stepResponse.c_step.c_name || 'Unknown Step',
        hasBranchingLogic: stepResponse.c_step && 
          branchingLogicAffectedStepIds.includes(String(stepResponse.c_step._id)),
        displayName: `${stepResponse.c_step && stepResponse.c_step.c_order || ''}. ${stepResponse.c_step && stepResponse.c_step.c_name || 'Unknown Step'}`
      }))
    } catch (error) {
      logger.error(`Error getting screens for task response ${taskResponseId}:`, error)
      faults.throw('dcr_intake.notFound.task_response')
    }
  }

}

module.exports = { StepResponseService }