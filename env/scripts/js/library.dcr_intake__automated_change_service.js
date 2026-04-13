/**
 * @fileOverview
 * @summary Implements automated data change request logic.
 * Methods from repositories should be used to interact with other services/db.
 *
 * @author Clinical Data Squad
 *
 * @example
 * const { AutomatedChangeService } = require('dcr_intake__automated_change_service')
 */

const { PublicUserRepository } = require('dcr_intake__public_user_repository'),
      { DcrExecutionRepository } = require('dcr_intake__dcr_execution_repository'),
      { CaseRepository } = require('dcr_intake__case_repository'),
      { TaskAssignmentRepository } = require('dcr_intake__task_assignment_repository'),
      { GenerationTriggerRepository } = require('dcr_intake__gen_trigger_repository'),
      { StudyRepository } = require('dcr_intake__study_repository'),
      { TaskResponseRepository } = require('dcr_intake__task_response_repository'),
      { VisitRepository } = require('dcr_intake__visit_repository'),
      { GroupRepository } = require('dcr_intake__group_repository'),
      { CommentService } = require('dcr_intake__comment_service'),
      { StepResponseRepository } = require('dcr_intake__step_response_repository'),
      { TaskResponseService } = require('dcr_intake__task_response_service'),
      { SignedCaseRepository } = require('dcr_intake__signed_case_repository'),
      { DcrService } = require('dcr_intake__dcr_service'),
      faults = require('c_fault_lib'),
      logger = require('logger')

/**
 * Data Change Request Automated Changes Library
 *
 * @class AutomatedChangeService
 */

class AutomatedChangeService {

  /**
   * Execute the automated change
   * @param {String} dcrExecutionId
   * @return
   */
  static triggerAutomatedChange(dcrExecutionId) {
    const { dcr_intake__case_id: caseId, creator } = DcrExecutionRepository.getById(dcrExecutionId, ['creator']),
          dcr = DcrService.getById(caseId)
    CommentService.createInternal(
      dcr._id,
      `System-assisted change initialized. Data change request: ${JSON.stringify({
        dcr_intake__public_user_number: dcr.dcr_intake__public_user_number,
        dcr_intake__site_id: dcr.dcr_intake__site_id,
        dcr_intake__changes: dcr.dcr_intake__changes
      })}.`,
      creator
    )
    let changeSummaries
    try {
      changeSummaries = this._executeAutomatedChange(dcr)
    } catch (error) {
      const { errCode, reason } = error,
            errorSummary = `System-assisted change failed. Error details: ${JSON.stringify({ errCode, reason })}.`
      CommentService.createInternal(dcr._id, errorSummary, creator)
      DcrExecutionRepository.update(dcrExecutionId, {
        dcr_intake__details: errorSummary,
        dcr_intake__status: DcrExecutionRepository.status.FAILED
      })
      throw error
    }
    CommentService.createInternal(
      dcr._id,
      `System-assisted change succeeded. Executed changes: ${changeSummaries.internal}`,
      creator
    )
    DcrExecutionRepository.update(dcrExecutionId, {
      dcr_intake__details: changeSummaries.internal,
      dcr_intake__status: DcrExecutionRepository.status.SUCCESS
    })
    CaseRepository.updateStatus(dcr._id, CaseRepository.statuses.CLOSED)
    SignedCaseRepository.updateAsClosed({
      dcr_intake__case_id: dcr._id
    }, {
      dcr_intake__closed_by: creator._id
    })
    CommentService.createPublic(dcr._id, changeSummaries.public, {
      ...creator,
      nameVisibility: CommentService.visibility.ALL
    })
  }

  /**
   * Executes change and returns comment
   * @param {Object} dcr
   * @return {Object} change summaries
   */
  static _executeAutomatedChange(dcr) {
    const auditMessage = this.buildAuditMessage(
      dcr._id,
      dcr.dcr_intake__number,
      dcr.dcr_intake__reason_notes || dcr.dcr_intake__reason
    )
    switch (dcr.dcr_intake__type.toLowerCase()) {
      case CaseRepository.types.UPDATE_PARTICIPANT_ID:
        return this.updateParticipantId({
          dcr_intake__changes: dcr.dcr_intake__changes,
          dcr_intake__public_user_number: dcr.dcr_intake__public_user_number
        }, auditMessage)
      case CaseRepository.types.INACTIVATE_PARTICIPANT:
        return this.inactivateParticipant({
          dcr_intake__public_user_number: dcr.dcr_intake__public_user_number
        }, auditMessage)
      case CaseRepository.types.MOVE_COMPLETED_TASKS_TO_ANOTHER_VISIT:
        return this.moveCompletedTasksToNewVisitAndGroup({
          dcr_intake__changes: dcr.dcr_intake__changes,
          dcr_intake__public_user_number: dcr.dcr_intake__public_user_number
        }, auditMessage)
      case CaseRepository.types.INACTIVATE_TASK_RESPONSE:
        return this.deactivateTaskResponse({
          dcr_intake__site_id: dcr.dcr_intake__site_id,
          dcr_intake__changes: dcr.dcr_intake__changes,
          dcr_intake__public_user_number: dcr.dcr_intake__public_user_number
        }, auditMessage)
    }
  }

  /**
   * -----------------------------------------------------
   * SCRIPTS BELOW FOR AUTOMATED CHANGES
   * -----------------------------------------------------
   */

  /**
   * Update participant ID
   * @param {Object} dcrParams
   * @param {String} auditMessage
   * @returns {Object} change summaries
   */
  static updateParticipantId(dcrParams, auditMessage) {
    logger.debug('updateParticipantId', dcrParams)
    const {
            dcr_intake__changes: intakeChanges,
            dcr_intake__public_user_number: publicUserNumber
          } = dcrParams,
          {
            dcr_intake__desired_value: desiredValue,
            dcr_intake__original_value: originalValue
          } = intakeChanges
    if (publicUserNumber !== originalValue) {
      faults.throw('dcr_intake.invalidArgument.dcr_intake__original_value')
    }
    const {
      _id: studyId,
      c_automatic_participant_id_generation: isAutomaticParticipantGenerationEnabled
    } = StudyRepository.get()
    if (isAutomaticParticipantGenerationEnabled) {
      StudyRepository.updateAutomaticParticipantIdGeneration(studyId, false)
    }
    try {
      PublicUserRepository.updateNumber(originalValue, desiredValue, auditMessage)
    } finally {
      if (isAutomaticParticipantGenerationEnabled) {
        StudyRepository.updateAutomaticParticipantIdGeneration(studyId, true)
      }
    }

    return {
      public: `${originalValue} was changed from ${originalValue} to ${desiredValue}.`,
      internal: `c_public_users.c_number was changed from ${originalValue} to ${desiredValue}.`
    }
  }

  /**
   * Deactivates all task responses for a visit/task name combination
   * @param {Object} dcrParams
   * @param {String} dcrParams.dcr_intake__public_user_number
   * @param {String} dcrParams.dcr_intake__site_id
   * @param {Object} dcrParams.dcr_intake__changes
   * @param {String} dcrParams.dcr_intake__changes.dcr_intake__task_response_id
   * @param {String} auditMessage
   * @returns {Object} change summaries
   */
  static deactivateTaskResponse(dcrParams, auditMessage) {
    logger.debug('deactivateTaskResponse', dcrParams)
    const {
            dcr_intake__changes: intakeChanges,
            dcr_intake__public_user_number: publicUserNumber,
            dcr_intake__site_id: siteId
          } = dcrParams,
          {
            dcr_intake__task_response_id: taskResponseIdToDeactivate
          } = intakeChanges,
          { _id: publicUserId } = PublicUserRepository.getByNumber(publicUserNumber)
    let taskResponseToDeactivate
    try {
      taskResponseToDeactivate = TaskResponseRepository.getOne({
        c_site: siteId,
        c_public_user: publicUserId,
        _id: taskResponseIdToDeactivate
      }, ['c_task'])
    } catch (error) {
      if (error.message === 'Iterator out of bounds.') {
        faults.throw('dcr_intake.notFound.taskResponse')
      }
      throw error
    }

    TaskResponseService.deactivate([taskResponseIdToDeactivate], auditMessage)

    return {
      public: `Task response for task (${taskResponseToDeactivate.c_task.c_name}) is deactivated.`,
      internal: `task response (${taskResponseToDeactivate._id}) for task (${taskResponseToDeactivate.c_task._id}) is deactivated.`
    }
  }

  /**
   * Deactivates all task responses for a participant
   * @param {Object} dcrParams
   * @param {String} dcrParams.dcr_intake__public_user_number
   * @param {String} auditMessage
   * @returns {Object} change summaries
   */
  static inactivateParticipant(dcrParams, auditMessage) {
    logger.debug('inactivateParticipant', dcrParams)
    const {
            dcr_intake__public_user_number: publicUserNumber
          } = dcrParams,
          { _id: publicUserId } = PublicUserRepository.getByNumber(publicUserNumber)

    const taskResponses = TaskResponseRepository.findByPublicUserId(publicUserId, ['c_task'])
    
    if (!taskResponses.length) {
      return {
        public: 'No task responses found for this participant.',
        internal: 'No task responses found for participant.'
      }
    }

    const taskResponseIds = taskResponses.map(taskResponse => taskResponse._id),
          taskNames = taskResponses.map(taskResponse => taskResponse.c_task.c_name)

    TaskResponseService.deactivate(taskResponseIds, auditMessage)
    PublicUserRepository.inactivateParticipant(publicUserNumber, auditMessage)

    return {
      public: `All task responses for participant ${publicUserNumber} (${taskNames.join(', ')}) were deactivated. Participant account was locked and notifications/events were cancelled.`,
      internal: `task responses (${taskResponseIds.join(', ')}) for tasks (${taskNames.join(', ')}) were deactivated for participant ${publicUserNumber}. Account locked, notifications cancelled, and televisit events cancelled.`
    }
  }

  /**
   * Moves task and step responses to a new visit/group
   * @param {Object} dcrParams
   * @param {String} auditMessage
   * @returns {Object} change summaries
   */
  static moveCompletedTasksToNewVisitAndGroup(dcrParams, auditMessage) {
    logger.debug('moveCompletedTasksToNewVisitAndGroup', dcrParams)
    const {
            dcr_intake__changes: intakeChanges,
            dcr_intake__public_user_number: publicUserNumber
          } = dcrParams,
          {
            dcr_intake__desired_value: targetVisitName,
            dcr_intake__desired_group_value: targetGroupName,
            dcr_intake__original_value: originalVisitName,
            dcr_intake__task_name: taskNameToMove
          } = intakeChanges

    // task names are a free text field, so skip
    if (taskNameToMove) {
      faults.throw('dcr_intake.invalidArgument.dcr_intake__automation_skipped')
    }

    const publicUser = PublicUserRepository.getByNumber(publicUserNumber)
    const originalVisits = VisitRepository.findByName(originalVisitName)

    if (originalVisits.length !== 1) {
      faults.throw('dcr_intake.invalidArgument.dcr_intake__original_value')
    }
    const [originalVisit] = originalVisits

    const desiredVisits = VisitRepository.findByName(targetVisitName)
    if (desiredVisits.length !== 1) {
      faults.throw('dcr_intake.invalidArgument.dcr_intake__desired_value')
    }

    const [desiredVisit] = desiredVisits

    const desiredGroups = GroupRepository.findByName(targetGroupName, ['c_group_tasks']),
          desiredVisitGroup = desiredGroups.length === 1 && desiredGroups[0].c_visits && desiredGroups[0].c_visits.map(visitId => String(visitId))
            .includes(String(desiredVisit._id)) ? desiredGroups[0] : undefined

    if (!desiredVisitGroup) {
      faults.throw('dcr_intake.invalidArgument.dcr_intake__desired_group_value')
    }

    const taskResponses = TaskResponseRepository.findComplete({
      c_visit: originalVisit._id,
      c_public_user: publicUser._id
    }, ['c_task'])
    if (!taskResponses.length) {
      faults.throw('dcr_intake.invalidArgument.dcr_intake__desired_value')
    }

    const taskResponseIds = taskResponses.map(taskResponse => taskResponse._id),
          taskNames = taskResponses.map(taskResponse => taskResponse.c_task.c_name)
    // TODO: Update c_task_response.c_group and c_task_response.c_visit to be auditable and extend test afterward
    TaskResponseRepository.updateVisitAndGroupByTaskResponseIds(taskResponseIds, desiredVisit._id, desiredVisitGroup._id, auditMessage)
    // TODO: Update c_step_response.c_group and c_step_response.c_visit to be auditable and extend test afterward
    StepResponseRepository.updateVisitAndGroupByTaskResponseIds(taskResponseIds, desiredVisit._id, desiredVisitGroup._id, auditMessage)

    const taskResponsesDeactivated = this._deactivateIncompatibleMovedTaskResponses(taskResponses, desiredVisitGroup, auditMessage)

    return {
      public: `${taskNames.join(', ')} ${taskNames.length === 1 ? 'was' : 'were'} moved from ${originalVisitName} to ${targetVisitName} in ${targetGroupName}.`,
      internal: `c_task_response.c_visit was set to ${desiredVisit._id} and c_task_response.c_group was set to ${desiredVisitGroup._id} for c_task_response._id in (${taskResponseIds.join(', ')}); ` +
      `c_step_response.c_visit was set to ${desiredVisit._id} and c_task_response.c_group was set to ${desiredVisitGroup._id} for c_step_response.c_task_response in (${taskResponseIds.join(', ')})` +
      (taskResponsesDeactivated.length > 0 ? `; c_task_response.c_status set to inactive, c_step_response.c_value/c_skipped unset, and Query.c_status set to cancelled for c_task_responses, c_step_responses.c_task_response and Queries.c_task_response in (${taskResponsesDeactivated.join(', ')}).` : '.')
    }
  }

  /**
   * Deactivate the task responses for tasks that aren't assigned to the target group
   * @param {Object[]} taskResponses
   * @param {String} targetGroup
   * @param {String} auditMessage
   */
  static _deactivateIncompatibleMovedTaskResponses(taskResponses, targetGroup, auditMessage) {
    const groupAssignedTasks = targetGroup.c_group_tasks.data.map(groupTask => String(groupTask.c_assignment._id))
    const taskResponseIdsToDeactivate = taskResponses.reduce((taskResponseIdsToDeactivate, taskResponse) => {
      if (!groupAssignedTasks.includes(String(taskResponse.c_task._id))) {
        taskResponseIdsToDeactivate.push(String(taskResponse._id))
      }
      return taskResponseIdsToDeactivate
    }, [])

    TaskResponseService.deactivate(taskResponseIdsToDeactivate, auditMessage)

    return taskResponseIdsToDeactivate
  }

  /**
   * Update step response value
   * @param {Object} dcrParams
   * @param {String} dcrParams.dcr_intake__public_user_number
   * @param {String} dcrParams.dcr_intake__site_id
   * @param {Object} dcrParams.dcr_intake__changes
   * @param {String} dcrParams.dcr_intake__changes.dcr_intake__step_response_id
   * @param {*} dcrParams.dcr_intake__changes.dcr_intake__original_value
   * @param {*} dcrParams.dcr_intake__changes.dcr_intake__desired_value
   * @param {String} auditMessage
   * @returns {Object} change summaries
   */
  static updateStepResponse(dcrParams, auditMessage) {
    logger.debug('updateStepResponse', dcrParams)
    const {
            dcr_intake__site_id: siteId,
            dcr_intake__changes: intakeChanges,
            dcr_intake__public_user_number: publicUserNumber
          } = dcrParams,
          {
            dcr_intake__step_response_id: stepResponseId,
            dcr_intake__original_value: originalValue,
            dcr_intake__desired_value: desiredValue
          } = intakeChanges,
          publicUser = PublicUserRepository.getByNumber(publicUserNumber)
    try {
      StepResponseRepository.updateValue({
        c_site: siteId,
        c_public_user: publicUser._id,
        _id: stepResponseId
      }, desiredValue, auditMessage)
    } catch (error) {
      if (error.errCode === 'cortex.notFound.instance') {
        faults.throw('dcr_intake.notFound.stepResponse')
      }
      throw error
    }
    return {
      internal: `c_value was changed from ${originalValue} to ${desiredValue} for c_step_response (${stepResponseId}).`
    }
  }

  /**
   * Update patient flag
   * @param {Object} dcrParams
   * @param {String} dcrParams.dcr_intake__public_user_number
   * @param {Object} dcrParams.dcr_intake__changes
   * @param {String} dcrParams.dcr_intake__changes.dcr_intake__set_patient_flag_id
   * @param {Boolean} dcrParams.dcr_intake__changes.dcr_intake__original_value
   * @param {Boolean} dcrParams.dcr_intake__changes.dcr_intake__desired_value
   * @param {String} auditMessage
   * @returns {Object} change summaries
   */
  static resetPatientFlag(dcrParams, auditMessage) {
    logger.debug('resetPatientFlag', dcrParams)
    const {
            dcr_intake__changes: intakeChanges,
            dcr_intake__public_user_number: publicUserNumber
          } = dcrParams,
          {
            dcr_intake__set_patient_flag_id: setPatientFlagId
          } = intakeChanges,
          publicUser = PublicUserRepository.getByNumber(publicUserNumber),
          setPatientFlagToUpdate = publicUser.c_set_patient_flags
            .find(setPatientFlag => String(setPatientFlag._id) === setPatientFlagId)
    if (!setPatientFlagToUpdate) {
      faults.throw('dcr_intake.notFound.publicUserSetPatientFlag')
    }
    PublicUserRepository.updateSetPatientFlag(publicUser._id, {
      _id: setPatientFlagToUpdate._id,
      c_enabled: false
    }, auditMessage)
    return {
      internal: `c_enabled was changed to false for c_set_patient_flag (${setPatientFlagToUpdate._id}).`
    }
  }



  /**
   * Build audit message
   * @param {String} caseId
   * @param {String} dcrNumber
   * @param {String=} reason
   * @returns {String} audit message
   */
  static buildAuditMessage(caseId, dcrNumber, reason) {
    return `SF ID - ${caseId} | DCR Number - ${dcrNumber}: ${reason || 'not specified'}`
  }

  /**
   * Regenerate public user events
   * @param {Object} dcrParams
   * @param {String} auditMessage
   * @returns {Object} change summaries
   */
  static addAnchorDateAndRegenerateEvents(dcrParams, auditMessage) {
    logger.debug('addAnchorDateAndRegenerateEvents', dcrParams)
    const {
            dcr_intake__public_user_number: publicUserNumber,
            dcr_intake__changes
          } = dcrParams,
          {
            dcr_intake__anchor_date_template_id: templateId,
            dcr_intake__date: newDate
          } = dcr_intake__changes

    const publicUser = PublicUserRepository.getByNumber(publicUserNumber, ['c_set_dates.c_template']),
          setDateToUpdate = publicUser.c_set_dates.find(setDate => String(setDate.c_template._id) === templateId)
    if (!setDateToUpdate) {
      faults.throw('dcr_intake.notFound.publicUserAnchorDate')
    }
    PublicUserRepository.updateSetDate(publicUser._id, {
      _id: setDateToUpdate._id,
      c_date: newDate
    }, auditMessage)
    const assignmentIds = TaskAssignmentRepository.findIdsForAnchorDateTemplate(setDateToUpdate.c_template._id)
    GenerationTriggerRepository.createAnchorDate({
      c_public_user: publicUser._id,
      c_updated_assignments: assignmentIds
    })
    // workaround for the error during mdctl env import when c_axon_adv_task_scheduler is not available in older versions of axon,
    // so it could not be required directly
    // POST /sys/script_runner is not an option here because cortex API could not call itself due to auth host restriction,
    // but it could become the correct approach if this code would be migrated from cortex script to separate service
    org.objects.bulk()
      .async({
        onComplete: `
          import { AdvanceTaskScheduling } from 'c_axon_adv_task_scheduler'
          import logger from 'logger'
          
          try {
            AdvanceTaskScheduling.generateEventsForUser(new ObjectID('${publicUser._id}'))
            logger.debug('AdvanceTaskScheduling.generateEventsForUse("${publicUser._id}") was executed successfully for REGENERATE_ANCHOR_DATE_EVENTS dcr')
          } catch(error) {
            logger.error('AdvanceTaskScheduling.generateEventsForUser("${publicUser._id}") failed for REGENERATE_ANCHOR_DATE_EVENTS dcr', error)
          }  
        `
      })
      .next()
    return {
      internal: `new c_generation_trigger was created for c_public_user ${publicUser._id}; "AdvanceTaskScheduling.generateEventsForUser" was triggered.`
    }
  }

  /**
   * Remove public user anchor date
   * @param {Object} dcrParams
   * @returns {Object} change summaries
   */
  static removeAnchorDate(dcrParams) {
    logger.debug('removeAnchorDate', dcrParams)
    const {
            dcr_intake__public_user_number: publicUserNumber,
            dcr_intake__changes
          } = dcrParams,
          { dcr_intake__anchor_date_template_id: templateId } = dcr_intake__changes

    const publicUser = PublicUserRepository.getByNumber(publicUserNumber),
          setDateToRemove = publicUser.c_set_dates.find(setDate => String(setDate.c_template._id) === templateId)
    if (!setDateToRemove) {
      faults.throw('dcr_intake.notFound.publicUserAnchorDate')
    }
    PublicUserRepository.removeSetDateForNumber(publicUserNumber, setDateToRemove._id)
    return {
      internal: `c_public_user.c_set_dates[]._id ${setDateToRemove._id} was removed for c_public_user.c_public_number ${publicUserNumber}.`
    }
  }

}

module.exports = { AutomatedChangeService }