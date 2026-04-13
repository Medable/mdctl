/**
 * @fileOverview
 * @summary Implements task response related logic.
 * Methods from repositories should be used to interact with other services/db.
 *
 * @author Data Management Squad
 *
 * @example
 * const { TaskResponseService } = require('dcr_intake__task_response_service')
 */

const { TaskResponseRepository } = require('dcr_intake__task_response_repository'),
  { AccountService } = require('dcr_intake__account_service'),
  { AuthService } = require('dcr_intake__auth_service'),
  { SiteService } = require('dcr_intake__site_service'),
  { BranchingLogicService } = require('dcr_intake__branching_logic_service'),
  config = require('config'),
  axonVer = config.get('axon__version'),
  cache = require('cache'),
  faults = require('c_fault_lib'),
  logger = require('logger')

/**
 * Task Response Service
 *
 * @class TaskResponseService
 */

class TaskResponseService {

  /**
   * @memberOf TaskResponseService
   * @param {Object=} filters
   * @param {String[]=} expand
   * @return {Object[]} task responses
   */
  static findForLoggedInUser(filters = {}, expand = []) {
    const siteIds = SiteService.findIdsForLoggedInUser(),
      taskResponses = TaskResponseRepository.findForSiteIds(siteIds, filters, [...expand, 'creator']),
      isAccessible = AuthService.roleGroups.DATA_SERVICE_TEAM_ONLY.includes(AuthService.getLoggedInAccountRole())
    return taskResponses
      .reduce((result, taskResponse) => {
        const { creator, ...taskResponseWithoutCreator } = taskResponse
        if (isAccessible || !AccountService.checkIfPatient(creator.roles)) {
          result.push(taskResponseWithoutCreator)
        }
        return result
      }, [])
  }

  /**
   * Inactivate task responses
   * @memberOf TaskResponseService
   * @param {String[]} taskResponseIds
   * @param {String} auditMessage
   * @return {void}
   */
  static deactivate(taskResponseIds, auditMessage) {
    for (const taskResponseId of taskResponseIds) {
      /**
       * https://gitlab.medable.com/axon/org/-/commit/d20c8122292215e038579287c4220f4c1c05498c - changes introduced in axon 4.14.1 that use a different flow for deactivating task responses. Both look for auditmessages set in cache, but with a different prefix.
       */
      if (axonVer < '4.14.1') {
        cache.set('TRInactiveReason-' + taskResponseId, auditMessage)
      } else {
        const { TaskResponseDeactivation } = require('c_task_response_deactivation')
        TaskResponseDeactivation.setDeactivationMessageCache(taskResponseId, auditMessage)
      }
    }

    TaskResponseRepository.setInactiveByIds(taskResponseIds, auditMessage)
  }

  /**
   * Get task responses for a specific activity/task
   * @memberOf TaskResponseService
   * @param {String} activityId Activity/Task ID
   * @param {String} participantId Optional participant ID to filter task responses
   * @return {Object[]} Array of task responses for the activity
   */
  static getTaskResponsesForActivity(activityId, participantId = null) {
    try {
      const siteIds = SiteService.findIdsForLoggedInUser()
      const filters = { c_task: activityId }

      // Add participant filter if provided
      if (participantId) {
        filters.c_public_user = participantId
      }

      const expand = ['c_task', 'c_public_user', 'c_visit']

      const taskResponses = TaskResponseRepository.findForSiteIds(siteIds, filters, expand)

      // Format task responses for the frontend
      return taskResponses.map(taskResponse => ({
        _id: taskResponse._id,
        c_number: taskResponse.c_number,
        c_status: taskResponse.c_status,
        c_start: taskResponse.c_start,
        c_end: taskResponse.c_end,
        c_completed: taskResponse.c_completed,
        c_task: taskResponse.c_task,
        c_public_user: taskResponse.c_public_user,
        c_visit: taskResponse.c_visit,
        // Add any other relevant fields
        displayName: `${taskResponse.c_number} - ${taskResponse.c_task && taskResponse.c_task.c_name || 'Unknown Task'} - ${taskResponse.c_start ? new Date(taskResponse.c_start).toLocaleDateString() : 'No Date'}`
      }))
    } catch (error) {
      logger.error(`Error getting task responses for activity ${activityId}:`, error)
      faults.throw('dcr_intake.notFound.activity')
    }
  }

  static getScreensForTaskResponse(taskResponseId) {
    const taskResponse = TaskResponseRepository.getOne({ _id: taskResponseId }, ['c_task', 'c_step_responses', 'c_step_responses.c_step'])

    const branchingLogicAffectedSteps = BranchingLogicService.getAffectedStepsForChange(taskResponseId)
    const branchingLogicAffectedStepIds = branchingLogicAffectedSteps.affectedSteps.map(affectedStep => String(affectedStep.stepId))

    let sortedStepResponses = taskResponse.c_step_responses && taskResponse.c_step_responses.data.sort((a, b) => {
      return (a.c_step.c_order || 0) - (b.c_step.c_order || 0)
    })

    let resArray = []
    for (const stepResponse of sortedStepResponses) {
      let step = stepResponse.c_step || {}
      let screenObject = {
        id: stepResponse._id,
        stepId: step._id,
        stepResponseId: stepResponse._id,
        name: step.c_name || 'Unknown Step',
        label: `${step.c_order || ''}. ${step.c_name || 'Unknown Step'}`,
        question: (step.c_question) || (step.c_text) || 'No question text',
        type: step.c_type || 'text',
        order: step.c_order || 0,
        originalValue: stepResponse.c_original_value || stepResponse.c_value || '',
        stepKey: step.c_key || '',
        screen: step.c_name || 'Unknown Step',
        hasBranchingLogic:
          branchingLogicAffectedStepIds.includes(String(step._id)),
        displayName: `${step.c_order || ''}. ${step.c_name || 'Unknown Step'}`
      }

      let choices = step.c_text_choices || [];
      let allowMultiples = step.c_screen_details && step.c_screen_details.c_screen_data && step.c_screen_details.c_screen_data.allow_multiples

      if (step.c_screen_details && step.c_screen_details.c_screen_data && step.c_screen_details.c_screen_data.choices_variable && choices.length == 0) {
        // this is a dynamic VRS, go to the task response and get the options 
        const choicesVariable = step.c_screen_details.c_screen_data.choices_variable
        const taskResponseMetadata = taskResponse.c_metadata.variables
        const choiceVariables = taskResponseMetadata[choicesVariable]

        const choiceLabels = choiceVariables.map((cv, idx) => {
          return {
            c_text: Object.values(cv.labels).map(tr => tr.display).join(', '), 
            c_order: idx, 
            c_value: cv.value
          }
        })

        choices = choiceLabels
      }

      screenObject.choices = choices
      screenObject.allowMultiples = allowMultiples || false

      resArray.push(screenObject)
    }
    return resArray
  }

  static getSiteResponsesForVisitForParticipant(visitId, participantId) {
    const siteIds = SiteService.findIdsForLoggedInUser()
    const filters = { c_visit: visitId }

    // Add participant filter if provided
    if (participantId) {
      filters.c_public_user = participantId
    }

    const expand = ['c_task', 'c_public_user', 'c_visit', 'c_step_responses.c_step']

    const taskResponses = TaskResponseRepository.findForSiteIds(siteIds, filters, expand)

    return taskResponses.filter(taskResponse => {
      return taskResponse.c_task.c_observation_type === 'clinro'
    }).map(taskResponse => ({
      _id: taskResponse._id,
      c_number: taskResponse.c_number,
      c_status: taskResponse.c_status,
      c_start: taskResponse.c_start,
      c_end: taskResponse.c_end,
      c_completed: taskResponse.c_completed,
      c_task: taskResponse.c_task,
      c_public_user: taskResponse.c_public_user,
      c_visit: taskResponse.c_visit,
      c_step_responses: taskResponse.c_step_responses,
      // Add any other relevant fields
      displayName: `${taskResponse.c_number} - ${taskResponse.c_task && taskResponse.c_task.c_name || 'Unknown Task'} - ${taskResponse.c_start ? new Date(taskResponse.c_start).toLocaleDateString() : 'No Date'}`
    }))
  }

}

module.exports = { TaskResponseService }