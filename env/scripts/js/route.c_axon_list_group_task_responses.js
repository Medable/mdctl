/***********************************************************

@script     Axon - List Group Task Responses

@brief      List task responses for a public user in a specific group.

@route      /routes/c_sites/:siteId/c_public_users/:publicUserId/c_groups/:groupId/c_task_responses

@parameter siteId The site ID.  The calling user must have read access to this site.
@parameter publicUserId: The id of the user to list task responses for.  The
                         public user must be associated with the siteId.
@parameter groupId: the group id to fetch task responses for.

@returns A list of c_task_response objects, in the standard cortex response wrapper.

@version    4.10.0

(c)2019 Medable, Inc.  All Rights Reserved.

***********************************************************/

/**
 * @openapi
 * /c_sites/{siteId}/c_public_users/{publicUserId}/c_groups/{groupId}/c_task_responses:
 *  get:
 *    description: 'List task responses for a public user in a specific group.'
 *    parameters:
 *      - name: groupId
 *        in: path
 *        required: true
 *        description: The group id to fetch task responses for.
 *      - name: publicUserId
 *        in: path
 *        required: true
 *        description: The id of the user to list task responses for. The public user must be associated with the siteId.
 *      - name: siteId
 *        in: path
 *        required: true
 *        description: The site ID.  The calling user must have read access to this site.
 *
 *    responses:
 *      '200':
 *        description: returns a list of c_task_response objects, in the standard cortex response wrapper.
 *        content:
 *          application/json:
 *            schema:
 *              $ref: '#/components/schemas/c_task_response'
 */

import req from 'request'
import { isIdFormat } from 'util.id'

import faults from 'c_fault_lib'
import nucUtils from 'c_nucleus_utils'

const { siteId, publicUserId, groupId } = req.params
let { where, sort, limit, skip } = req.query

const callerRoles = script.principal.roles

const accountId = script.principal._id

if (where) {
  where = JSON.parse(where)
}
if (sort) {
  sort = JSON.parse(sort)
}

if (!isIdFormat(siteId)) {
  faults.throw('axon.invalidArgument.validSiteRequired')
}

if (!isIdFormat(publicUserId)) {
  faults.throw('axon.invalidArgument.validSubjectRequired')
}

if (!isIdFormat(groupId)) {
  faults.throw('axon.invalidArgument.validGroupRequired')
}

let taskResponseCursor

if (!nucUtils.isNewSiteUser(callerRoles)) {
  // Read-through site/public user to fetch task responses.  This will 403 if
  taskResponseCursor = org.objects.c_sites.find()
    .pathPrefix(`${siteId}/c_subjects/${publicUserId}/c_task_responses`)
    .where({
      ...where,
      ...{
        c_group: groupId,
        c_completed: true
      }
    })
    .expand('c_task')
} else {
  taskResponseCursor = org.objects.accounts.find()
    .pathPrefix(`${accountId}/c_sites/${siteId}/c_subjects/${publicUserId}/c_task_responses`)
    .where({
      ...where,
      ...{
        c_group: groupId,
        c_completed: true
      }
    })
    .expand('c_task')
}

if (sort) {
  taskResponseCursor = taskResponseCursor.sort(sort)
}

if (skip) {
  taskResponseCursor = taskResponseCursor.skip(skip)
}

if (limit) {
  taskResponseCursor = taskResponseCursor.limit(limit)
}

return taskResponseCursor.transform('c_axon_calc_task_response_open_queries')