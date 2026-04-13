/***********************************************************

@script     Axon - List My Task Responses

@brief      List task responses for the public user for their current group.
            Ensures that current user has access to this public user.  Filtering
            and custom property expansion is implemented in a transform.

@route      /routes/c_public_users/:publicUserId/c_task_responses

@parameter  publicUserId: The id of the user to list task responses for.

@returns    A list of c_task_response objects, in the standard cortex response
            wrapper.

@version    4.12.0

(c)2019 Medable, Inc.  All Rights Reserved.

***********************************************************/

/**
 * @openapi
 * /c_public_users/{publicUserId}/c_task_responses:
 *  get:
 *    description: 'List task responses for the public user for their current group. Ensures that current user has access to this public user. Filtering and custom property expansion is implemented in a transform.'
 *    parameters:
 *      - name: publicUserId
 *        in: path
 *        required: true
 *        description: The id of the user to list task responses for.
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

import axonScriptLib from 'c_axon_script_lib'
import faults from 'c_fault_lib'
import { SystemUser } from 'c_nucleus_utils'

const { publicUserId } = req.params
let { where, sort, limit } = req.query,
    groupId

if (where) {
  where = JSON.parse(where)
}
if (sort) {
  sort = JSON.parse(sort)
}

if (!isIdFormat(publicUserId)) {
  faults.throw('axon.invalidArgument.validSubjectRequired')
}

const publicUser = org.objects.c_public_users.readOne({ _id: publicUserId })
  .skipAcl()
  .grant(consts.accessLevels.read)
  .execute()

if (script.principal._id.equals(consts.principals.anonymous)) {
  if (publicUser.c_account) {
    // Must be logged in to access this info.
    return faults.throw('axon.accessDenied.routeAccessDenied')
  }
  const group = axonScriptLib.findPublicGroup(publicUser.c_study._id)
  if (!group) {
    faults.throw('axon.invalidArgument.validGroupRequired')
  }
  groupId = group._id.toString()
} else {
  if (!publicUser.c_account._id.equals(script.principal._id)) {
    // Logged in as incorrect user.
    return faults.throw('axon.accessDenied.routeAccessDenied')
  }
  if (!publicUser.c_group) {
    faults.throw('axon.invalidArgument.validGroupRequired')
  }
  groupId = publicUser.c_group._id.toString()
}

let taskResponseCursor = org.objects.c_task_responses.find()
  .where({
    ...where,
    ...{
      c_public_user: publicUserId,
      c_group: groupId,
      c_completed: true
    }
  })
  .skipAcl()
  .grant(consts.accessLevels.read)

if (sort) {
  taskResponseCursor = taskResponseCursor.sort(sort)
}

if (limit) {
  taskResponseCursor = taskResponseCursor.limit(limit)
}

return taskResponseCursor.transform({
  memo: {
    tz: publicUser.c_tz
  },
  script: 'c_axon_expand_task_response_fields'
})