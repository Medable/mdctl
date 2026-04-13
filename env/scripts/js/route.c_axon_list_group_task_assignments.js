/***********************************************************

@script     Axon - List Group Task Assignments

@brief      List all task assignments for a public user in a specific group.

@route      /routes/c_sites/:siteId/c_public_users/:publicUserId/c_groups/:groupId/c_task_assignments

@parameter siteId The site ID.  The calling user must have read access to this site.
@parameter publicUserId: The id of the user to list task assignments for.  The
                         public user must be associated with the siteId.
@parameter groupId: the group id to fetch task assignments for.

@returns A list of c_task_assignment_wrapper objects, in the standard cortex response wrapper.

@version    4.10.0

(c)2019 Medable, Inc.  All Rights Reserved.

***********************************************************/

/**
 * @openapi
 * /c_sites/{siteId}/c_public_users/{publicUserId}/c_groups/{groupId}/c_task_assignments:
 *  get:
 *    description: 'List all task assignments for a public user in a specific group.'
 *    parameters:
 *      - name: groupId
 *        in: path
 *        required: true
 *        description: The group id to fetch task assignments for.
 *      - name: publicUserId
 *        in: path
 *        required: true
 *        description: The id of the user to list task assignments for. The public user must be associated with the siteId.
 *      - name: siteId
 *        in: path
 *        required: true
 *        description: The site ID.  The calling user must have read access to this site.
 *
 *    responses:
 *      '200':
 *        description: returns a list of c_task_assignment wrapper objects, in the standard cortex response wrapper.
 *        content:
 *          application/json:
 *            schema:
 *              $ref: '#/components/schemas/c_task_assignment'
 */

import req from 'request'
import { isIdFormat } from 'util.id'

import faults from 'c_fault_lib'
import { getTaskAssignments } from 'c_task_assignments_lib'
import nucUtils from 'c_nucleus_utils'

const { siteId, publicUserId, groupId } = req.params

const callerRoles = script.principal.roles

const accountId = script.principal._id

if (!isIdFormat(siteId)) {
  faults.throw('axon.invalidArgument.validSiteRequired')
}

if (!isIdFormat(publicUserId)) {
  faults.throw('axon.invalidArgument.validSubjectRequired')
}

if (!isIdFormat(groupId)) {
  faults.throw('axon.invalidArgument.validGroupRequired')
}

if (!nucUtils.isNewSiteUser(callerRoles)) {
  // Read-through site.  Will 403 if current user doesn't have access.
  org.objects.c_sites.find()
    .pathPrefix(`${siteId}/c_subjects/${publicUserId}`)
    .next()
} else {
  org.objects.accounts.find()
    .pathPrefix(`${accountId}/c_sites/${siteId}/c_subjects/${publicUserId}`)
    .next()
}

return getTaskAssignments(groupId, publicUserId)