/***********************************************************

@script     Axon - List Visits

@brief      List visits for a subject.  Fetches assignment count with visits.

@route      /routes/c_sites/:siteId/c_public_users/:publicUserId/c_visit_schedule

@parameter siteId The site ID.  The calling user must have read access to this site.
@parameter publicUserId: The id of the user to fetch non-visit groups for.

@returns A list of c_group_list_entry objects, in the standard cortex response wrapper.

@version    4.10.0

(c)2019 Medable, Inc.  All Rights Reserved.

***********************************************************/

/**
 * @openapi
 * /c_sites/{siteId}/c_public_users/{publicUserId}/c_visit_schedule:
 *  get:
 *    description: 'List visits for a subject. Fetches assignment count with visits.'
 *    parameters:
 *      - name: publicUserId
 *        in: path
 *        required: true
 *        description: The id of the user to fetch visit schedule for.
 *      - name: siteId
 *        in: path
 *        required: true
 *        description: The site ID.  The calling user must have read access to this site.
 *
 *    responses:
 *      '200':
 *        description: returns a list of c_group_list_entry objects, in the standard cortex response wrapper.
 *        content:
 *          application/json:
 *            schema:
 *              $ref: '#/components/schemas/c_group'
 */

import req from 'request'
import { isIdFormat } from 'util.id'
import faults from 'c_fault_lib'
import nucUtils from 'c_nucleus_utils'

const {
  c_group_tasks,
  c_sites,
  c_visits,
  c_task_assignment,
  c_task_responses,
  accounts
} = org.objects

const { siteId, publicUserId } = req.params

const callerRoles = script.principal.roles

const accountId = script.principal._id

if (!isIdFormat(siteId)) {
  faults.throw('axon.invalidArgument.validSiteRequired')
}

if (!isIdFormat(publicUserId)) {
  faults.throw('axon.invalidArgument.validSubjectRequired')
}

let publicUser

if (!nucUtils.isNewSiteUser(callerRoles)) {
  // Readthrough site.  Will 403 if current user doesn't have access.
  publicUser = c_sites.find()
    .pathPrefix(`${siteId}/c_subjects/${publicUserId}`)
    .expand('c_visit_schedule.c_visits.c_groups')
    .next()
} else {
  publicUser = accounts.find()
    .pathPrefix(`${accountId}/c_sites/${siteId}/c_subjects/${publicUserId}`)
    .expand('c_visit_schedule.c_visits.c_groups')
    .next()
}

let validVisits = []
if (publicUser.c_visit_schedule) {
  validVisits = publicUser.c_visit_schedule.c_visits.data
    .filter(visit => visit.c_groups.data[0])
}

const visitGroupIds = validVisits.map(visit => visit.c_groups.data[0]._id)
const validVisitsIds = validVisits.map(visit => visit._id)

// We need to aggregate task assignments but we may not have direct read access.
// skipAcl is safe here because we are performing an aggregate on non-pii data.
const groupAssignmentCount = c_group_tasks.aggregate()
  .match({
    c_group: {
      $in: visitGroupIds
    }
  })
  .group({
    _id: 'c_group',
    assignments: {
      $count: '_id'
    },
    tasks: {
      $push: 'c_assignment._id'
    }
  })
  .skipAcl()
  .grant(consts.accessLevels.read)
  .toArray()
  .reduce((memo, group) => {
    memo[group._id._id] = {
      count: group.assignments,
      tasks: group.tasks
    }
    return memo
  }, {})

const participantActivities = c_task_assignment.aggregate()
  .match({
    c_visit: { $in: validVisitsIds }
  })
  .group({
    _id: 'c_visit',
    assignments: {
      $count: '_id'
    },
    tasks: {
      $push: 'c_task._id'
    }
  })
  .skipAcl()
  .grant(consts.accessLevels.read)
  .toArray()
  .reduce((memo, group) => {
    memo[group._id._id] = {
      count: group.assignments,
      tasks: group.tasks
    }
    return memo
  }, {})

const validTasksIds = []
Object.values(participantActivities).forEach(({ tasks }) => validTasksIds.push(...tasks))

const completedParticipantActivities = c_task_responses.aggregate()
  .match({
    c_visit: { $in: validVisitsIds },
    c_task: { $in: validTasksIds },
    c_completed: true
  })
  .group({
    _id: 'c_visit',
    count: {
      $count: '_id'
    }
  })
  .skipAcl()
  .grant(consts.accessLevels.read)
  .toArray()
  .reduce((memo, group) => {
    memo[group._id._id] = {
      count: group.count
    }
    return memo
  }, {})

const memo = {
  publicUserId: publicUser._id,
  tz: publicUser.c_tz || 'UTC',
  publicUserSetDates: publicUser.c_set_dates || [],
  visitSchedule: publicUser.c_visit_schedule,
  groupAssignmentCount,
  participantActivities,
  completedParticipantActivities
}

return script.as(script.principal, { principal: { grant: consts.accessLevels.read, skipAcl: true } }, () => {
  return c_visits.find({ _id: { $in: validVisits.map(v => v._id) } })
    .expand('c_groups')
    .transform({ autoPrefix: true, memo, script: 'c_axon_visit_transform' })
})