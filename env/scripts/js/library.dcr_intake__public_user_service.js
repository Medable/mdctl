/**
 * @fileOverview
 * @summary Implements public user related logic.
 * Methods from repositories should be used to interact with other services/db.
 *
 * @author Data Management Squad
 *
 * @example
 * const { PublicUserService } = require('dcr_intake__public_user_service')
 */

const faults = require('c_fault_lib'),
      { PublicUserRepository } = require('dcr_intake__public_user_repository'),
      {VisitRepository} = require('dcr_intake__visit_repository'),
      { StepResponseRepository } = require('dcr_intake__step_response_repository'),
      { SiteService } = require('dcr_intake__site_service'), 
      logger = require('logger')

/**
 * Public User Service
 *
 * @class PublicUserService
 */

class PublicUserService {

  /**
   * Find public users for the logged-in user
   * @memberOf PublicUserService
   * @param {String} siteId
   * @param {Object} filters
   * @param {String[]=} expand
   * @return {Object[]} public users
   */
  static findForLoggedInUser(siteId, filters, expand = []) {
    const siteIds = SiteService.findIdsForLoggedInUser()
    if (!siteIds.includes(siteId)) {
      faults.throw('dcr_intake.notFound.site')
    }
    return PublicUserRepository.findBySiteIdAndFilters(siteId, filters, expand)
  }

  /**
   * Find public users for the logged-in user
   * @memberOf PublicUserService
   * @param {String} publicUserId
   * @return {Object[]} set dates
   */
  static getSetDatesWithTemplates(publicUserId) {
    const publicUser = PublicUserRepository.getById(publicUserId, ['c_set_dates.c_template'])
    return publicUser.c_set_dates
  }

  /**
   * Validate public user number
   * @memberOf PublicUserService
   * @param {String} oldValue
   * @param {String} newValue
   * @return {void}
   */
  static validateNumber(oldValue, newValue) {
    let publicUser
    try {
      publicUser = PublicUserRepository.getByNumber(newValue)
    } catch (error) {
      if (error.message !== 'Iterator out of bounds.') {
        throw error
      }
    }
    if (publicUser) {
      faults.throw('dcr_intake.conflict.new_number')
    }
    try {
      PublicUserRepository.validateNumber(oldValue, newValue)
    } catch (error) {
      if (error.code === 'kValidationError') {
        faults.throw('dcr_intake.invalidArgument.new_number')
      }
      if (!['axon.validationError.participantIDMustBeSystemGenerated', 'axon.validationError.participantIDCannotBeChanged'].includes(error.errCode)) {
        // in both cases, participant id cannot be changed through DCA, but we should allow the request to be submitted so CS can make this change
        throw error
      }
    }
  }

  static getTaskandStepResponsesforParticipant(c_public_user) {
    const taskResponsesForParticipant = PublicUserRepository.getTaskResponsesWithTasks(c_public_user)
    const taskResponseIds = taskResponsesForParticipant.map(tr => tr._id)
    const stepResponsesForTaskResponses = StepResponseRepository.getMany({c_task_response: {$in: taskResponseIds}}, ['c_step'])
    const stepResponsesByTR = stepResponsesForTaskResponses.reduce((acc, sr)=> {
      if (! sr.c_task_response) return acc
      const trId = String(sr.c_task_response._id)
      if (acc[trId]) {
        acc[trId].push(sr)
      } else {
        acc[trId] = [sr]
      }
      
      return acc
    }, {})

    return taskResponsesForParticipant.reduce((acc, tr) => {
      const taskResponseWithStepResponses = {...tr, c_step_responses: stepResponsesByTR[tr._id]}
      acc.push(taskResponseWithStepResponses)
      return acc
    }, [])
  }

  static getVisitsforParticipant(publicUserId) {
    const publicUser = PublicUserRepository.getById(publicUserId)
    const visitScheduleId = publicUser.c_visit_schedule._id

    const visits = VisitRepository.findByVisitSchedule(visitScheduleId)

    return visits.map(visit => {
      return {
        visitName: visit.c_name, 
        _id: visit._id, 
        visitCode: visit.c_visit_code
      }
    })
  }

  /**
   * Get activities for a participant
   * @memberOf PublicUserService
   * @param {String} publicUserId Public user ID
   * @return {Object[]} Array of activities assigned to the participant
   */
  static getActivitiesForParticipant(publicUserId) {
    try {
      // Get task responses for the participant to extract unique activities/tasks
      const taskResponses = PublicUserRepository.getTaskResponsesWithTasks(publicUserId)
      
      if (!taskResponses || !Array.isArray(taskResponses)) {
        logger.warn('Task responses is not an array:', taskResponses)
        return []
      }
      
      // Extract unique activities (tasks) and format them for the frontend
      const activities = taskResponses.reduce((acc, taskResponse) => {
        const task = taskResponse.c_task
        if (task && task.c_observation_type && task.c_observation_type === 'epro' && !acc.find(activity => String(activity._id) === String(task._id))) {
          acc.push({
            _id: task._id,
            c_name: task.c_name,
            c_code: task.c_code,
            c_type: task.c_type,
            c_key: task.c_key,
            // Add any other relevant task fields
            taskResponseCount: taskResponses.filter(tr => tr.c_task && tr.c_task._id === task._id).length
          })
        }
        return acc
      }, [])

      return activities
    } catch (error) {
      logger.error(`Error getting activities for participant ${publicUserId}:`, error)
      faults.throw('dcr_intake.notFound.public_user')
    }
  }

}

module.exports = { PublicUserService }