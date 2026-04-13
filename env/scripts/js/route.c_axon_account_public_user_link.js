/***********************************************************

@script     Axon - Account/Public User Link

@brief      Link public user to Medable account

@author     Matt Lean     (Medable.MIL)

@version    4.3.2         (Medable.MIL)

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import faults from 'c_fault_lib'

var moment = require('moment'),
    objects = require('objects'),
    request = require('request'),
    axonScriptLib = require('c_axon_script_lib')

if (!request.body.account) {
  faults.throw('axon.invalidArgument.validAccountRequired')
}

if (!request.body.c_study) {
  faults.throw('axon.invalidArgument.validStudyRequired')
}

var account
var publicUser
var study

try {
  account = objects.read('accounts', request.body.account, { grant: 7, skipAcl: true })
} catch (err) {
  faults.throw('axon.invalidArgument.validAccountRequired')
}

try {
  study = objects.read('c_studies', request.body.c_study)
} catch (err) {
  faults.throw('axon.invalidArgument.validStudyRequired')
}

if (request.body.c_public_user) {
  try {
    publicUser = objects.read('c_public_users', request.body.c_public_user)
  } catch (err) {
    faults.throw('axon.invalidArgument.validSubjectRequired')
  }

  if (String(publicUser.c_study._id) !== request.body.c_study) {
    faults.throw('axon.invalidArgument.studyDoesNotMatchSubject')
  }
} else if (!request.body.c_public_user && study.c_limit_enroll) {
  faults.throw('axon.invalidArgument.validSubjectRequired')
}

var publicUserData = {
  c_account: account._id,
  c_state: 'verified'
}

if (!study.c_limit_enroll) {
  // check if there are public users with group assignments in the past
  var publicUsers = objects.list('c_public_users', { where: { $and: [{ c_account: account._id }, { c_study: study._id }] }, sort: { 'created': -1 } }).data

  for (var i in publicUsers) {
    var currPublicUser = publicUsers[i]

    if (request.body.c_public_user) {
      if (String(currPublicUser._id) === String(publicUser._id)) {
        continue
      }
    }

    if (!currPublicUser.c_group) {
      continue
    }

    // public user with group assignment found, assign current public user to the found group assignment
    if (currPublicUser.c_group) {
      publicUserData.c_group = currPublicUser.c_group._id
      break
    }
  }
}

if (request.body.c_public_user) {
  publicUser = objects.update('c_public_users', request.body.c_public_user, publicUserData)
} else {
  if (publicUserData.c_group) {
    publicUserData.c_group = objects.read('c_groups', publicUserData.c_group)
  }

  publicUserData.c_account = account
  publicUser = publicUserData
}

var groups = objects.list('c_groups', { where: { c_study: request.body.c_study }, limit: 1000 })

if (!publicUser.c_group) {
  publicUser.c_group = axonScriptLib.findAllGroup(request.body.c_study)

  if (!publicUser.c_group) {
    faults.throw('axon.error.allGroupNotFound')
  }
}

// If Medable account exists, check to see if it's enrolled into a group for this study already
var acctStudyGroupIndex = -1

// eslint-disable-next-line no-redeclare
for (var i = 0; i < groups.data.length; ++i) {
  var currGroup = String(groups.data[i]._id)

  for (var j = 0; j < account.c_study_groups.length; ++j) {
    var currAcctStudyGroup = String(account.c_study_groups[j])

    if (currGroup === currAcctStudyGroup) {
      acctStudyGroupIndex = j
      break
    }
  }
}

var currTime = moment().utc().format()
var oldEnrollment = null

// Enroll the Medable account into the group
if (acctStudyGroupIndex > -1) {
  var studyGroupId = account.c_study_groups.splice(acctStudyGroupIndex, 1) // Remove old group from c_study_groups

  // Log the unenrollment in the enrollment history
  for (var k = (account.c_enrollments.length - 1); k >= 0; --k) {
    var currEnrollment = account.c_enrollments[k]

    if (!currEnrollment.c_left && (String(currEnrollment.c_group._id) === String(studyGroupId))) {
      oldEnrollment = currEnrollment
      break
    }
  }
}

// Add new group into c_study_groups
account.c_study_groups.push(publicUser.c_group._id)

// Log enrollment in the enrollment history
var newEnrollment = {
  c_group: publicUser.c_group._id,
  c_joined: currTime
}

var patchOps = [{
  op: 'push',
  path: 'c_enrollments',
  value: newEnrollment
}, {
  op: 'set',
  path: 'c_study_groups',
  value: account.c_study_groups
}]

if (oldEnrollment) {
  patchOps.push({
    op: 'set',
    path: 'c_enrollments.' + oldEnrollment._id + '.c_left',
    value: currTime
  })
}

account = objects.patch('accounts', account._id, patchOps, { grant: 7, skipAcl: true })

// update previous task responses created by public user to point to account
if (request.body.c_public_user) {
  var taskResponses = objects.list('c_task_responses', { where: { c_public_user: publicUser._id }, limit: 1000 })
  var c_task_responses = []

  // eslint-disable-next-line no-redeclare
  for (var i = 0; i < taskResponses.data.length; ++i) {
    var currTaskId = taskResponses.data[i]._id

    c_task_responses.push(objects.update('c_task_responses', currTaskId, { c_account: account._id }))
  }
}

var returnData = {
  account: account,
  c_task_responses: c_task_responses
}

if (request.body.c_public_user) {
  returnData.c_public_user = publicUser
}

return returnData