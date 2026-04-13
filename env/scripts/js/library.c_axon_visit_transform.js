/***********************************************************

 @script     Visit List transform: Library

 @brief      A transform to act on c_visit to add properties necessary for subject management in a clinical site

 @author     Fiachra Matthews

 @version    1.0.0

  (c)2016-2018 Medable, Inc.  All Rights Reserved.
  Unauthorized use, modification, or reproduction is prohibited.
  This is a component of Axon, Medable's SmartStudy(TM) system.

 ***********************************************************/

import moment from 'moment.timezone'
import logger from 'logger'
import { transform } from 'decorators'
const {
  c_queries,
  c_step_responses,
  c_task_responses,
  c_study
} = org.objects

const getTaskResponses = (filter) => {
  return c_task_responses.find(filter)
    .skipAcl()
    .grant(consts.accessLevels.read)
    .paths('_id')
    .map(v => v._id)
}

const study = c_study.find().paths('c_pinned_version').next()

if (!study.c_pinned_version) {
  logger.warn('c_pinned_version is not set')
}

@transform
class VisitListTransform {

  each(visit, memo) {
    const groupId = visit.c_groups.data[0]._id
    const c_sequence = visit.c_groups.data[0].c_sequence
    const visitAnchor = study.c_pinned_version && study.c_pinned_version >= 40000
      ? visit.c_anchor_date
      : visit.c_anchor_date || memo.visitSchedule.c_default_anchor_date
    const visitStartSkipEnableAnchor = visit.c_visit_start_skip_enable_anchor
    const assignments = (memo.groupAssignmentCount[groupId] && memo.groupAssignmentCount[groupId].count) || 0
    const participant_activities_count = (memo.participantActivities[visit._id] && memo.participantActivities[visit._id].count) || 0
    const completed_participant_activities_count = (memo.completedParticipantActivities[visit._id] && memo.completedParticipantActivities[visit._id].count) || 0
    const total_activities_count = assignments + participant_activities_count

    // To get all the open queries, we need to get bot the step and task level queries for that subject,
    // so we gather task and step response IDs matching group and subject
    const stepResponseIds = c_step_responses.find({
      c_group: groupId,
      c_public_user: memo.publicUserId
    })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .paths('_id')
      .map(v => v._id)

    const taskResponseFilter = {
      c_group: groupId,
      c_public_user: memo.publicUserId
    }

    const taskResponseForSiteVisitsFilter = { ...taskResponseFilter, c_visit: visit._id }

    const taskResponseIds = getTaskResponses(taskResponseFilter)

    const taskResponseForSite = getTaskResponses(taskResponseForSiteVisitsFilter)

    const c_completed_assignments = taskResponseIds.length || 0

    const c_completed_assignments_for_site = taskResponseForSite.length || 0

    const c_open_queries = c_queries.find({
      c_status: 'open',
      $or: [
        { c_task_response: { $in: taskResponseIds } },
        { c_step_response: { $in: stepResponseIds } }
      ]
    })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .count()

    let c_window_start = visit.c_schedule ? visit.c_schedule.c_days_from_start : undefined
    let c_window_end = visit.c_schedule ? visit.c_schedule.c_days_from_start : undefined

    if (visit.c_schedule && visit.c_schedule.c_minus) {
      c_window_start -= visit.c_schedule.c_minus
    }

    if (visit.c_schedule && visit.c_schedule.c_plus) {
      c_window_end += visit.c_schedule.c_plus
    }

    const response = {
      c_group: groupId,
      c_name: visit.c_name,
      c_visit: visit._id,
      c_type: visit.c_type,
      c_optional: visit.c_optional,
      c_window_start,
      c_window_end,
      c_open_queries,
      c_completed_assignments,
      c_completed_assignments_for_site,
      c_sequence,
      assignments,
      participant_activities_count,
      completed_participant_activities_count,
      total_activities_count
    }

    if (visitStartSkipEnableAnchor) {
      response.c_visit_start_skip_enable_anchor = visitStartSkipEnableAnchor
    }

    if (visitAnchor) {
      const setDate = memo.publicUserSetDates.find(v => v.c_template._id.equals(visitAnchor._id))

      if (setDate) {
        response.c_window_start_date = moment(setDate.c_date)
          .add(c_window_start, 'days')
          .format('YYYY-MM-DD')
        response.c_window_end_date = moment(setDate.c_date)
          .add(c_window_end, 'days')
          .format('YYYY-MM-DD')
      }

    }

    return response
  }

}

module.exports = VisitListTransform