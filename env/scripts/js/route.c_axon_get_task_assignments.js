/***********************************************************

 @script     Axon - Get Task Assignments

 @brief      Get task assignments for a public user or enrolled subject. Returns
             task assignments, plus the last completion data for that task.

             Study Subject Usage:
             * unauthorized request with c_public_user and c_study: returns task
               assignments for that user for the public group.
             * authorized request with c_study: returns task assignments for the
               current user for their current group.

             Site User Usage:
             * not yet implemented.

 @author     Pete Richards

 @query

    c_study: study id, required. the study to get task assignments for
    c_public_user: public user id, optional.  If not supplied, returns task assignments
        from public group.
    token: the invite pin that was sent with the invite. Only necessary if c_study.requiresInvite and !c_public_user.c_account

@response    a list of task assignments, ex:

    {
      "object": "list",
      "data": [
        {
          "object": "c_task_assignment_wrapper",
          "c_group_task": {
            // c_group_task with c_assignment (a c_task) expanded, including c_steps and c_branches
          },
          // Last response for this task, if it exists.
          "last_response": null,
          // Number of completions for this task.
          "completed_count": null
        }
      ],
      "hasMore": false
    }

 (c)2019 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import { principals, accessLevels } from 'consts'
import request from 'request'
import { isIdFormat } from 'util.id'

import axonScriptLib from 'c_axon_script_lib'
import { getTaskAssignments } from 'c_task_assignments_lib'
import faults from 'c_fault_lib'

let {
      c_public_user: publicUserId,
      c_study: studyId,
      token
    } = request.query,
    groupId,
    publicUser

// Validate studyId, 404 if study not found.
if (!studyId || !isIdFormat(studyId)) {
  faults.throw('axon.invalidArgument.validStudyRequired')
}

let study = org.objects.c_studies
  .find({ _id: studyId })
  .skipAcl()
  .grant(accessLevels.read)
  .limit(1)
  .next() // will 404 if not found

if (script.principal._id.equals(principals.anonymous)) {
  // Public user id is required.
  if (!publicUserId || !isIdFormat(publicUserId)) {
    faults.throw('axon.invalidArgument.validSubjectRequired')
  }
}

// Anonymous requests are only allowed when the public user does not have an account associated.
if (script.principal._id.equals(principals.anonymous)) {
  publicUser = org.objects.c_public_users
    .find({ _id: publicUserId })
    .limit(1)
    .skipAcl()
    .grant(accessLevels.read)
    .next()

  if (publicUser.c_account) {
    return faults.throw('axon.accessDenied.routeAccessDenied')
  }
  if (!publicUser.c_study._id.equals(studyId)) {
    faults.throw('axon.invalidArgument.studyDoesNotMatchSubject')
  }

  const group = axonScriptLib.findPublicGroup(studyId)
  if (!group) {
    faults.throw('axon.invalidArgument.validGroupRequired')
  }
  groupId = group._id.toString()

  if (study.c_requires_invite) {
    if (!token) {
      return faults.throw('axon.invalidArgument.subjectTokenRequired')
    }

    if (publicUser.c_access_code !== token) {
      return faults.throw('axon.invalidArgument.subjectTokenRequired')
    }
  }
} else {

  // Fetch public user from account.
  const [publicUser] = org.objects
    .c_public_users
    .find({
      c_account: script.principal._id
    })
    .skipAcl()
    .grant(accessLevels.read)
    // doing reduce without limit because
    // on prod there will never be an account in more than one public user
    // in testing environments there could be just a few
    .reduce((acc, curr) => {
      if (curr.c_study._id.equals(studyId)) acc.push(curr)
      return acc
    }, [])

  if (!publicUser) {
    faults.throw('axon.invalidArgument.validSubjectRequired')
  }

  if (!publicUser.c_group) {
    faults.throw('axon.invalidArgument.validGroupRequired')
  }

  publicUserId = publicUser._id.toString()

  groupId = publicUser.c_group._id.toString()

}

return getTaskAssignments(groupId, publicUserId)