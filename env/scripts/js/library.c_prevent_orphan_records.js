/***********************************************************

@script     AXON - Task Deletion Trigger

@brief     Prevent deletion of task that might cause orphan records to prevent data inconsistency

@author     Ugochukwu Nwajagu

@version    1.0.0

(c)2016-2020 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import faults from 'c_fault_lib'
const { trigger, log } = require('decorators')
const {
  c_task_assignment,
  c_task_response,
  c_step,
  c_step_response,
  c_branch,
  c_group_task,
  c_events,
  c_anchor_date_template,
  c_patient_flag,
  c_public_users,
  c_visit_schedule, c_visit
} = org.objects
const { accessLevels } = consts
class PreventOrphanRecordsLibrary {

  @log({ traceError: true })
  @trigger('delete.before', {
    object: 'c_patient_flag',
    weight: 1,
    principal: 'c_system_user',
    if: {
      $eq: [
        {
          $cache: 'orphan_records_disabled'
        },
        null
      ]
    }
  })
  static validatePatientFlagOnDeletion({ context: { _id: patientFlagId } }) {

    const { c_identifier: patientFlagIdentifier } = c_patient_flag
      .find({ _id: patientFlagId })
      .paths('c_identifier')
      .next()

    const publicUserCursor = c_public_users
      .find({ 'c_set_patient_flags.c_identifier': patientFlagIdentifier })

    if (publicUserCursor.hasNext()) {
      faults.throw('axon.invalidArgument.patientFlagIsAssigned')
    }

    // Check if task patient flag is associated with a task assignment
    const count = org.objects.c_task_assignment
      .find({ 'c_assignment_availability.c_flag': patientFlagId })
      .count()

    if (count > 0) {
      faults.throw('axon.validationError.patientFlagIsAssignedToTaskAssignment')
    }

  }

  @log({ traceError: true })
  @trigger('delete.before', {
    object: 'c_task',
    active: true,
    weight: 0.7,
    principal: 'c_system_user',
    if: {
      $eq: [
        {
          $cache: 'orphan_records_disabled'
        },
        null
      ]
    }
  })
  static beforeTaskDelete({ context }) {
    // Get a list of all task responses associated with this already fetched task
    const taskResponses = c_task_response
      .find({
        c_task: context._id
      })
      .count()

    // If there are still tasks responses associated with this task, return
    if (taskResponses > 0) {
      faults.throw('axon.validationError.orphanRecordsDetected')
    }

    // Get all groups associated with task
    const groupTasks = c_group_task
      .find({
        c_assignment: context._id
      })
      .count()

    // if task if assocated with any group, and if group still exists, return
    if (groupTasks > 0) {
      faults.throw('axon.validationError.orphanRecordsDetected')
    }

    const relatedFlowRules = c_group_task
      .find({ 'c_flow_rules.c_dependency': context._id })
      .count()

    if (relatedFlowRules > 0) {
      faults.throw('axon.validationError.orphanRecordsDetected')
    }

    // Get all anchor dates associated with the task
    const anchorDates = c_anchor_date_template.find({
      c_task_completion: context._id
    })
      .count()

    if (anchorDates > 0) {
      faults.throw('axon.validationError.orphanRecordsDetected')
    }

    // Check if a patient flag is associated with this
    const patientFlags = c_patient_flag
      .find({ 'c_conditions.c_task_completion': context._id })
      .count()

    if (patientFlags > 0) faults.throw('axon.validationError.orphanRecordsDetected')

    // Get all task assignments related to this task
    const taskAssignments = c_task_assignment
      .find({ c_task: context._id })
      .count()

    if (taskAssignments > 0) {
      faults.throw('axon.validationError.orphanRecordsDetected')
    }

  }

  @log({ traceError: true })
  @trigger('delete.before', {
    object: 'c_step',
    active: true,
    weight: 0.7,
    principal: 'c_system_user',
    if: {
      $eq: [
        {
          $cache: 'orphan_records_disabled'
        },
        null
      ]
    }
  })
  static beforeStepDelete({ context }) {

    const stepResponses = c_step_response.find({
      c_step: context._id
    })
      .count()

    if (stepResponses > 0) {
      faults.throw('axon.validationError.orphanRecordsDetected')
    }

    // check if step is currently being used in a branch
    const branches = c_branch.find({
      c_default_destination: context._id
    })
      .count()
    // if branch exists, throw error
    if (branches > 0) {
      faults.throw('axon.validationError.orphanRecordsDetected')
    }
  }

  @log({ traceError: true })
  @trigger('delete.before', {
    object: 'c_visit',
    active: true,
    weight: 2,
    principal: 'c_system_user',
    if: {
      $eq: [
        {
          $cache: 'orphan_records_disabled'
        },
        null
      ]
    }
  })
  static beforeVisitDelete({ context }) {

    const taskResponseCursor = c_task_response.find({ c_visit: context._id })
      .grant(consts.accessLevels.read)
      .skipAcl()

    if (taskResponseCursor.hasNext()) {
      faults.throw('axon.validationError.orphanRecordsDetected')
    }

  }

  @log({ traceError: true })
  @trigger('delete.before', {
    object: 'c_visit_schedule',
    active: true,
    weight: 2,
    principal: 'c_system_user',
    if: {
      $eq: [
        {
          $cache: 'orphan_records_disabled'
        },
        null
      ]
    }
  })
  static beforeVisitScheduleDelete({ context }) {
    const visitScheduleId = context._id

    const visits = c_visit.find({ c_visit_schedules: visitScheduleId })
      .grant(consts.accessLevels.read)
      .skipAcl()
      .toArray()
      .map(visit => visit._id)

    const taskResponseCursor = c_task_response.find({ c_visit: { $in: visits } })
      .grant(consts.accessLevels.read)
      .skipAcl()

    if (taskResponseCursor.hasNext()) {
      faults.throw('axon.validationError.orphanRecordsDetected', 'the visit schedule cant be deleted')
    }

  }

  @log({ traceError: true })
  @trigger('delete.before', {
    object: 'c_task_assignment',
    weight: 1,
    if: {
      $eq: [
        {
          $cache: 'orphan_records_disabled'
        },
        null
      ]
    }
  })
  static taskAssignmentBeforeDelete({ context }) {

    const dependentAssginments = c_task_assignment.find({ 'c_dependencies.c_parent_assignment': context._id })
      .grant(consts.accessLevels.read)
      .skipAcl()
      .count()
    if (dependentAssginments > 0) {
      faults.throw('axon.validationError.orphanRecordsDetected')
    }

    const events = c_events.find({ c_task_assignment: context._id })
      .grant(consts.accessLevels.read)
      .skipAcl()
      .count()
    if (events > 0) {
      faults.throw('axon.validationError.orphanRecordsDetected')
    }
  }

  @log({ traceError: true })
  @trigger('delete.before', {
    object: 'c_anchor_date_template',
    active: true,
    weight: 1,
    if: {
      $eq: [
        {
          $cache: 'orphan_records_disabled'
        },
        null
      ]
    },
    principal: 'c_system_user'
  })
  static onDeleteAnchorDate({ context }) {
    const anchorDateObject = c_anchor_date_template
      .find({ _id: context._id })
      .next()

    // Check if anchor date is used in a visit
    const visitCount = c_visit
      .find({
        c_anchor_date: anchorDateObject._id
      })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .count()

    if (visitCount > 0) {
      faults.throw('axon.validationError.orphanRecordsDetected')
    }

    // Check if anchor date is used in a visit schedule
    const visitScheduleCount = c_visit_schedule
      .find({
        c_default_anchor_date: anchorDateObject._id
      })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .count()

    if (visitScheduleCount > 0) {
      faults.throw('axon.validationError.orphanRecordsDetected')
    }

    // Check if anchor date is used in a group task
    const groupTaskDatesCount = c_group_task
      .find({
        $or: [
          {
            'c_start_date_anchor.c_template': anchorDateObject._id
          },
          {
            'c_end_date_anchor.c_template': anchorDateObject._id

          }
        ]

      })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .count()

    if (groupTaskDatesCount > 0) {
      faults.throw('axon.validationError.orphanRecordsDetected')
    }

    // Check if anchor date is used in an ATS task assignment
    const taskAssignmentDateCount = c_task_assignment
      .find({
        $or: [
          {
            'c_start_date.c_anchor_date_template': anchorDateObject._id
          },
          {
            'c_end_date.c_anchor_date_template': anchorDateObject._id
          }
        ]
      })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .count()

    if (taskAssignmentDateCount > 0) {
      faults.throw('axon.validationError.orphanRecordsDetected')
    }

    const publicUserCount = org.objects.c_public_users.find({ c_set_dates: { $elemMatch: { c_template: anchorDateObject._id } } })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .count()

    if (publicUserCount > 0) {
      faults.throw('axon.validationError.orphanRecordsDetected')
    }
  }

  @log({ traceError: true })
  @trigger('delete.before', {
    object: 'c_site',
    active: true,
    weight: 0.7,
    principal: 'c_system_user'
  })
  static onSiteDelete({ context }) {
    const siteId = context._id
    const groupTasksCursor = c_group_task
      .find({ c_sites: { $in: [siteId] } })
    while (groupTasksCursor.hasNext()) {
      const groupTask = groupTasksCursor.next()
      const groupTaskSites = groupTask.c_sites
      const arr = []
      groupTaskSites.forEach((site) => {
        if (`${site}` !== `${siteId}`) {
          arr.push(site)
        }
      })
      c_group_task.updateOne({ _id: groupTask._id }, { $set: { c_sites: arr } })
        .skipAcl()
        .grant(accessLevels.update)
        .execute()
    }

  }

  static isStatusAssociated(newStudy, oldStudy) {
    const newSubjectStatusList = newStudy.c_subject_status_list.map((item) => item.c_status_value)
    const subjectStatusList = oldStudy.c_subject_status_list.map((item) => item.c_status_value)

    if (subjectStatusList.length === newSubjectStatusList.length) {
      return
    }

    const deletedStatus = subjectStatusList.filter((x) => !newSubjectStatusList.includes(x))[0]

    if (!deletedStatus) return

    const publicUserCursor = c_public_users.find({
      c_status: deletedStatus
    })
      .skipAcl()
      .grant('read')

    if (publicUserCursor.hasNext()) {
      faults.throw('axon.validationError.publicUserSubjectStatusExists')
    }

    if (oldStudy.c_subject_enrollment_status === deletedStatus) {
      faults.throw('axon.validationError.publicUserSubjectStatusExists')
    }

    // Check if the deleted subject status is default one and no new default subject status.
    const deletedStatusDetails = oldStudy.c_subject_status_list.filter((item) => item.c_status_value === deletedStatus)
    const newDefaultStatus = newStudy.c_subject_status_list.filter((item) => item.c_default === true)
    if (deletedStatusDetails[0].c_default === true && newDefaultStatus.length === 0) {
      faults.throw('axon.validationError.subjectStatusIsDefaultOne')
    }

    const [task] = org.objects.c_tasks
      .aggregate([
        {
          $match: { c_study: oldStudy._id }
        },
        {
          $project: {
            c_set_subject_status_success: 1,
            c_set_subject_status_failure: 1
          }
        }])
      .expressionPipeline([{
        $group: {
          success: { $addToSet: '$$ROOT.c_set_subject_status_success' },
          failure: { $addToSet: '$$ROOT.c_set_subject_status_failure' }
        }
      },
      {
        $project: {
          statuses: { $concatArrays: ['$$ROOT.success', '$$ROOT.failure'] }
        }
      }])
      .skipAcl()
      .grant('read')
      .toArray()

    if (task && task.statuses.includes(deletedStatus)) {
      faults.throw('axon.validationError.publicUserSubjectStatusExists')
    }

    const [visit] = org.objects.c_visit
      .aggregate([
        {
          $project: {
            c_set_subject_status_confirmed: 1,
            c_set_subject_status_skipped: 1
          }
        }])
      .expressionPipeline([{
        $group: {
          confirmed: { $addToSet: '$$ROOT.c_set_subject_status_confirmed' },
          skipped: { $addToSet: '$$ROOT.c_set_subject_status_skipped' }
        }
      },
      {
        $project: {
          statuses: { $concatArrays: ['$$ROOT.confirmed', '$$ROOT.skipped'] }
        }
      }])
      .skipAcl()
      .grant('read')
      .toArray()

    if (visit && visit.statuses.includes(deletedStatus)) {
      faults.throw('axon.validationError.publicUserSubjectStatusExists')
    }
  }

  @log({ traceError: true })
  @trigger('delete.before', { object: 'account', weight: 1, principal: 'c_system_user' })
  static removeSiteUserBeforeAccountDelete({ context }) {
    org.objects.c_site_users.deleteMany({ c_account: context._id })
      .execute()
  }

}

module.exports = PreventOrphanRecordsLibrary