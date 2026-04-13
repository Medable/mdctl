/***********************************************************

@script     Axon - Unenroll User

@brief      Unenroll a user from a study

@body
    account: ID of account that needs to be unenrolled
    c_group: group _id that user needs to be unenrolled from

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import moment from 'moment'
import request from 'request'
import logger from 'logger'
import _ from 'underscore'
import faults from 'c_fault_lib'

/* eslint-disable camelcase, one-var */

const { account, c_group } = request.body,
      { accounts, c_groups, c_studies, c_public_users } = org.objects,
      accountCursor = account && accounts.find({ _id: account })
        .skipAcl()
        .grant(consts.accessLevels.read)
        .paths('_id', 'email', 'c_enrollments', 'roles', 'c_study_groups', 'c_public_users.c_study'),
      userAccount = accountCursor && accountCursor.hasNext() && accountCursor.next(),
      groupCursor = c_group && c_groups.find({ _id: c_group })
        .skipAcl()
        .grant(consts.accessLevels.read),
      group = groupCursor && groupCursor.hasNext() && groupCursor.next(),
      study = group && c_studies.find({ _id: group.c_study._id })
        .skipAcl()
        .grant(consts.accessLevels.read)
        .next(),
      currentTime = moment()
        .utc()
        .format(),
      studyGroupIndex = userAccount && group && userAccount.c_study_groups.map(v => v.toString())
        .indexOf(group._id.toString())

if (!account || !userAccount) {
  faults.throw('axon.invalidArgument.validAccountRequired')
}

if (!c_group || !group) {
  faults.throw('axon.invalidArgument.validGroupRequired')
}

if (studyGroupIndex < 0) {
  faults.throw('axon.invalidArgument.userNotEnrolled')
}

userAccount.c_study_groups.splice(studyGroupIndex, 1)
userAccount.roles = userAccount.roles.filter(v => !v.equals(consts.roles.c_study_participant))

let previousEnrollment = userAccount.c_enrollments.reverse()
      .find(v => group._id.equals(v.c_group._id)),
    updatedAccount = accounts.updateOne({ _id: userAccount._id }, { $set: { c_study_groups: userAccount.c_study_groups, roles: userAccount.roles } })
      .skipAcl()
      .grant(consts.accessLevels.update)
      .lean(false)
      .execute()

if (previousEnrollment && !previousEnrollment.c_left) {
  accounts.updateOne({ _id: userAccount._id }, { $set: { c_left: currentTime } })
    .pathPrefix(`c_enrollments.${previousEnrollment._id}`)
    .skipAcl()
    .grant(consts.accessLevels.update)
    .lean(false)
    .execute()
  updatedAccount = accounts.find({ _id: updatedAccount._id })
    .skipAcl()
    .grant(consts.accessLevels.read)
    .paths('_id', 'email', 'c_enrollments', 'c_study_groups')
    .next()
}

if (userAccount.c_public_users && userAccount.c_public_users.data.length > 0) {
  let pu = userAccount.c_public_users.data.find(v => v.c_study._id.equals(v.c_study._id))
  if (pu) {
    c_public_users.updateOne({ _id: pu._id }, { $set: { c_state: 'left' } })
      .skipAcl()
      .grant(consts.accessLevels.update)
      .execute()
  }
}

script.exit(_.pick(updatedAccount, '_id', 'email', 'name', 'c_enrollments', 'c_study_groups'))