/***********************************************************

@script     Axon - List Non-Visit Groups

@brief      List the non-visit groups for a subject in a particular site,
            including a patient tasks group, if the subject has patient tasks.

@route      /routes/c_sites/:siteId/c_public_users/:publicUserId/non_visit_groups

@parameter siteId The site ID.  The calling user must have read access to this site.
@parameter publicUserId: The id of the user to fetch non-visit groups for.

@returns A list of c_group_list_entry objects, in the standard cortex response wrapper.

@version    4.10.0

(c)2019 Medable, Inc.  All Rights Reserved.

***********************************************************/

/**
 * @openapi
 * /c_sites/{siteId}/c_public_users/{publicUserId}/non_visit_groups:
 *  get:
 *    description: 'List the non-visit groups for a subject in a particular site, including a patient tasks group, if the subject has patient tasks.'
 *    parameters:
 *      - name: publicUserId
 *        in: path
 *        required: true
 *        description: The id of the user to fetch non-visit groups for.
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

const { siteId, publicUserId } = req.params

const callerRoles = script.principal.roles

const accountId = script.principal._id

if (!isIdFormat(siteId)) {
  faults.throw('axon.invalidArgument.validSiteRequired')
}

if (!isIdFormat(publicUserId)) {
  faults.throw('axon.invalidArgument.validSubjectRequired')
}

let site, study, publicUser

if (!nucUtils.isNewSiteUser(callerRoles)) {
  site = org.objects.c_sites
    .readOne({ _id: siteId })
    .execute()

  study = org.objects.c_studies
    .readOne({ _id: site.c_study._id })
    .paths('c_menu_config')
    .execute()

  // Readthrough site.  Will 403 if user doesn't have access.
  publicUser = org.objects.c_sites.find()
    .pathPrefix(`${siteId}/c_subjects/${publicUserId}`)
    .next()
} else {
  site = org.objects.accounts.find()
    .pathPrefix(`${accountId}/c_sites/${siteId}`)
    .next()

  study = org.objects.c_studies
    .readOne({ _id: site.c_study._id })
    .paths('c_menu_config')
    .execute()

  // Read site through account.  Will 403 if user doesn't have access.
  publicUser = org.objects.accounts.find()
    .pathPrefix(`${accountId}/c_sites/${siteId}/c_subjects/${publicUserId}`)
    .next()
}

const menuGroups = study.c_menu_config.filter((mg) => mg.c_menu === 'subject'),
      menuGroupIds = menuGroups.map(mg => mg.c_group_id),
      patientGroupIds = []

if (publicUser.c_group && publicUser.c_group._id) {
  patientGroupIds.push(publicUser.c_group._id)
}

// We need to aggregate task assignments but we may not have direct read access.
// skipAcl is safe here because we are performing an aggregate on non-pii data.
const groupAssignmentCount = org.objects.c_group_tasks.aggregate()
  .match({
    c_group: {
      $in: [...patientGroupIds, ...menuGroupIds]
    }
  })
  .group({
    _id: 'c_group',
    assignments: {
      $count: '_id'
    }
  })
  .skipAcl()
  .grant(consts.accessLevels.read)
  .reduce((memo, group) => {
    memo[group._id._id] = group.assignments
    return memo
  }, {})

// In order to return query counts for each group with only a single aggregate
// query, we will aggregate open queries by task response and then compute a
// sum for each group.

// Start by generating statistics for each group.
const groupStatisticsById = org.objects.c_task_responses.aggregate()
  .match({
    c_group: {
      $in: [...patientGroupIds, ...menuGroupIds]
    },
    c_public_user: publicUser._id
  })
  .group({
    _id: 'c_group',
    responseIds: {
      $push: '_id'
    }
  })
  .limit(1000)
  .skipAcl()
  .grant(consts.accessLevels.read)
  .reduce((memo, group) => {
    memo[group._id._id] = group
    return memo
  }, {})

// Invert the map to allow task response id -> group lookup.
const groupsByResponseId = Object.values(groupStatisticsById)
  .reduce((memo, group) => ({
    ...memo,
    ...group.responseIds.reduce((m, responseId) => ({
      ...m,
      [responseId]: group
    }), {})
  }), {})

// Count open queries for each task response, and then sum open queries for
// each c_group.
org.objects.c_queries.aggregate()
  .match({
    c_task_response: {
      $in: Object.keys(groupsByResponseId)
    },
    c_status: 'open'
  })
  .group({
    _id: 'c_task_response',
    c_open_queries: {
      $count: '_id'
    }
  })
  .limit(1000)
  .skipAcl()
  .grant(consts.accessLevels.read)
  .forEach(responseQueries => {
    const group = groupsByResponseId[responseQueries._id._id]
    if (group.c_open_queries) {
      group.c_open_queries += responseQueries.c_open_queries
    } else {
      group.c_open_queries = responseQueries.c_open_queries
    }
  })

function openQueriesForGroup(groupId) {
  const groupResponses = groupStatisticsById[groupId]
  if (!groupResponses || !groupResponses.c_open_queries) {
    return 0
  }
  return groupResponses.c_open_queries
}

const patientTasksGroupsEntries = patientGroupIds.map((patientGroupId) => {
  return {
    c_group: patientGroupId,
    object: 'c_group_list_entry',
    assignments: groupAssignmentCount[patientGroupId] || 0,
    c_open_queries: openQueriesForGroup(patientGroupId),
    is_patient_tasks: true
  }
})

const menuGroupsEntries = menuGroups.map((menuGroup) => {
  return {
    c_group: menuGroup.c_group_id,
    object: 'c_group_list_entry',
    c_name: menuGroup.c_display_name,
    assignments: groupAssignmentCount[menuGroup.c_group_id] || 0,
    c_open_queries: openQueriesForGroup(menuGroup.c_group_id)
  }
})

return [...patientTasksGroupsEntries, ...menuGroupsEntries]