/***********************************************************

@script     Axon - Research Authentication

@brief      Axon study/group authentication and public user
            linking

@version    4.3.2

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import moment from 'moment'
import request from 'request'
import axonScriptLib from 'c_axon_script_lib'
import faults from 'c_fault_lib'
import config from 'config'

const { accounts, c_studies, c_public_users, c_groups } = org.objects,
      { account: accID, c_study, c_public_user } = request.body,
      // Get the account
      accountCursor = accID && accounts.find({ _id: accID })
        .skipAcl()
        .grant(consts.accessLevels.read)
        .expand('c_public_users'),
      account = accountCursor && accountCursor.hasNext() && accountCursor.next(),
      // Get the study
      studyCursor = c_study && c_studies.find({ _id: c_study })
        .skipAcl()
        .grant(consts.accessLevels.read),
      study = studyCursor && studyCursor.hasNext() && studyCursor.next(),
      // get the study groups
      groupsCursor = study && c_groups.find({ c_study: study._id })
        .skipAcl()
        .grant(consts.accessLevels.read),
      groups = groupsCursor && groupsCursor.toArray(),
      // check if the user is enrolled in the supplied study
      inStudy = study && account && account.c_public_users.data.some(v => {
        return v.c_study._id.equals(study._id)
      }),
      accountGroupsList = account && account.c_study_groups.map(v => v.toString()),
      studyGroupIds = groups && groups.map(v => v._id.toString()),
      // check if the the accounts study groups has an item in this study's groups list
      enrolledInStudyGroup = accountGroupsList && studyGroupIds && studyGroupIds.some(v => accountGroupsList.includes(v)),
      // if no public user parameter, get the ID from the account
      accountPublicUser = account && account.c_public_users.data.find(v => v.c_study._id.equals(study._id)),
      publicUserId = c_public_user || (accountPublicUser && accountPublicUser._id),
      publicUserCursor = publicUserId && c_public_users.find({ _id: publicUserId })
        .skipAcl()
        .grant(consts.accessLevels.read),
      publicUser = publicUserCursor && publicUserCursor.hasNext() && publicUserCursor.next()

function generateAuthToken(accountId) {
  const { tokenLifetimeInSeconds } = config.get('axon__task_response_upload_token_config') || { tokenLifetimeInSeconds: 7884000 } // 3 months by default
  const authTokenConfig = {
    scope: '*',
    permanent: false,
    includeEmail: true,
    policy: [
      { method: 'POST', path: '/routes/create_task_response' },
      { method: 'PUT', route: '/c_task_response/([a-fa-f0-9]{24})' }
    ],
    expiresIn: tokenLifetimeInSeconds
  }

  // Use account._id instead of script.originalPrincipal._id to avoid issues with account update triggers
  // that may modify script.originalPrincipal before this function is called
  // This also prevents "token subject must be an authenticated principal" errors
  return org.objects.account.createAuthToken(request.client.key, accountId, authTokenConfig)
}
if (!account) {
  faults.throw('axon.invalidArgument.validAccountRequired')
}

if (!study) {
  faults.throw('axon.invalidArgument.validStudyRequired')
}

const returnData = { enrollChanged: false }

if (publicUser.c_type === 'caregiver') {

  const relationships = org.objects.c_caregiver_relationship
    .find({
      c_caregivers_info: {
        $elemMatch: {
          c_public_user: publicUser._id
        }
      }
    })
    .skipAcl()
    .grant(consts.accessLevels.read)
    .toArray()

  const currentCaregiverStatus = relationships.map(relationship => {
    const caregiverInfo = relationship.c_caregivers_info.find(info => info.c_public_user._id.equals(publicUser._id))
    return caregiverInfo
      ? {
        invite_status: caregiverInfo.c_invite_status,
        is_active: caregiverInfo.c_caregiver_active
      }
      : null
  }).filter(status => status !== null)

  const isInactiveEverywhere = currentCaregiverStatus.every(status =>
    (status.invite_status === 'cancelled' || status.invite_status === 'completed') &&
    status.is_active === false
  )

  if (isInactiveEverywhere) {
    faults.throw('axon.invalidArgument.userNotEnrolled')
  } else {
    returnData.taskResponseAuthToken = generateAuthToken(account._id)
    return returnData
  }
}

if (!inStudy) {
  faults.throw('axon.invalidArgument.userNotEnrolled')
}

if (publicUser) {

  if (!publicUser.c_study._id.equals(study._id)) {
    faults.throw('axon.invalidArgument.studyDoesNotMatchSubject')

  } else if (publicUser.c_account && publicUser.c_account._id && !publicUser.c_account._id.equals(account._id)) {
    faults.throw('axon.invalidArgument.subjectRegistered')
  }

  if (enrolledInStudyGroup) {
    // get the study group id
    const studyGroupId = accountGroupsList.reduce((a, v) => {
      a = studyGroupIds.find(id => id === v)
      return a
    }, null)

    // just make sure they have the correct role
    accounts.updateOne({ _id: account._id }, { $push: { roles: [consts.roles.c_study_participant] } })
      .skipAcl()
      .grant(consts.accessLevels.update)
      .lean(false)
      .execute()

    returnData.c_group = studyGroupId && groups.find(v => v._id.equals(studyGroupId))
    // All is done. This user can proceed to the study

  } else {
    // re-enrollment required
    // check that the public users group is valid

    if (studyGroupIds.find(id => publicUser.c_group._id.equals(id))) {
      // re-enroll the user
      const enrollment = {
        c_group: publicUser.c_group._id,
        c_joined: moment()
          .utc()
          .format(),
        c_study: study._id
      }

      accounts.updateOne({ _id: account._id }, { $push: { c_enrollments: enrollment, c_study_groups: publicUser.c_group._id }, roles: [consts.roles.c_study_participant] })
        .skipAcl()
        .grant(consts.accessLevels.update)
        .lean(false)
        .execute()
      c_public_users.updateOne({ _id: publicUser._id }, { $set: { c_state: 'authorized' } })
        .skipAcl()
        .grant(consts.accessLevels.update)
        .execute()

      returnData.c_group = groups.find(v => v._id.equals(publicUser.c_group._id))
      // All is done. This user can proceed to the study

    } else {
      faults.throw('axon.error.usersCannotEnroll')
    }
  }

  returnData.taskResponseAuthToken = generateAuthToken(account._id)
} else {
  // No obvious public user can be found for this user
  faults.throw('axon.invalidArgument.noSubjectForAccount')
}

axonScriptLib.track('logins', request.body.c_study)
script.exit(returnData)