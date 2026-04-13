/***********************************************************

@script     Axon - List Public User Task Responses

@brief      List all task responses created by the public user.  This includes
            any task responses submitted before they had an account.

@route      /routes/c_sites/:siteId/c_public_users/:publicUserId/c_task_responses

@parameter siteId The site ID.  The calling user must have read access to this site.
@parameter publicUserId: The id of the user to list task responses for.  The
                         public user must be associated with the siteId.

@returns A list of c_task_response objects, in the standard cortex response wrapper.

@version    4.10.0

(c)2019 Medable, Inc.  All Rights Reserved.

***********************************************************/

/**
 * @openapi
 * /c_sites/{siteId}/c_public_users/{publicUserId}/c_task_responses:
 *  get:
 *    description: 'List all task responses created by the public user. This includes any task responses submitted before they had an account'
 *    parameters:
 *      - name: publicUserId
 *        in: path
 *        required: true
 *        description: The id of the user to list task responses groups for. The public user must be associated with the siteId.
 *      - name: siteId
 *        in: path
 *        required: true
 *        description: The site ID.  The calling user must have read access to this site.
 *
 *    responses:
 *      '200':
 *        description: returns a list of c_task_response objects, in the standard cortex response wrapper.
 */

import req from 'request'
import { isIdFormat } from 'util.id'

import faults from 'c_fault_lib'
import { SystemUser, isNewSiteUser } from 'c_nucleus_utils'

const { siteId, publicUserId } = req.params
let { where, sort, limit } = req.query

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

let publicUser, taskResponseCursor

if (!isNewSiteUser(callerRoles)) {
  // Read-through site.  This will 403 the current user doesn't have access.
  publicUser = org.objects.c_sites.find()
    .pathPrefix(`${siteId}/c_subjects/${publicUserId}`)
    .limit(1)
    .next()
} else {
  publicUser = org.objects.accounts.find()
    .pathPrefix(`${accountId}/c_sites/${siteId}/c_subjects/${publicUserId}`)
    .limit(1)
    .next()
}

const systemUser = org.objects.org.readOne({ _id: org._id })
  .skipAcl()
  .grant(consts.accessLevels.read)
  .paths('serviceAccounts')
  .execute()
  .serviceAccounts
  .find(serviceAccount => serviceAccount.name === SystemUser.name)

const creatorIds = [systemUser._id.toString()]

// Fetch legacy system user.
const legacySystemUser = org.objects.accounts.readOne({ email: SystemUser.email })
  .skipAcl()
  .grant(consts.accessLevels.read)
  .throwNotFound(false)
  .execute()

if (legacySystemUser) {
  creatorIds.push(legacySystemUser._id.toString())
}

if (publicUser.c_account) {
  creatorIds.push(publicUser.c_account._id.toString())
}

if (!isNewSiteUser(callerRoles)) {

  // Read-through site & publicUser. This will 403 if the current user doesn't
  // have access.
  taskResponseCursor = org.objects.c_sites.find()
    .pathPrefix(`${siteId}/c_subjects/${publicUserId}/c_task_responses`)
    .where({
      ...where,
      ...{
        creator: {
          $in: creatorIds
        },
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
        creator: {
          $in: creatorIds
        },
        c_completed: true
      }
    })
    .expand('c_task')
}

if (sort) {
  taskResponseCursor = taskResponseCursor.sort(sort)
}

if (limit) {
  taskResponseCursor = taskResponseCursor.limit(limit)
}

return taskResponseCursor