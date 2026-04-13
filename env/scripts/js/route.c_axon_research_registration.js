/***********************************************************

@script     Axon - Research Registration

@brief      Route to associate pubic user and task responses
            with newly registered user

@body
    account: account object
    c_public_user: c_public_user object

@version    4.3.2

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import moment from 'moment'
import request from 'request'
import axonScriptLib from 'c_axon_script_lib'
import faults from 'c_fault_lib'
import _ from 'underscore'
import { AdvanceTaskScheduling } from 'c_axon_adv_task_scheduler'
import PatientFlagsLib from 'c_patient_flags_lib'

/* eslint-disable camelcase, one-var */

const { accounts, c_public_users, c_tasks, c_groups } = org.objects
const sanitize = account => { delete account.roles; return account }
const { c_public_user, c_task, c_event } = request.body
const account = sanitize(request.body.account)
const publicUserUpdate = {}
let temporaryPublicUserID
const isLoginMethodsAvailable = org.objects.org.find()
  .skipAcl()
  .grant('read')
  .paths('configuration')
  .filter(config => config.configuration.loginMethods).length > 0

let { publicUser, study, accountCreationData } = validateRouteParams(account)

if (study && study.c_use_advanced_task_scheduler && (!c_task || !c_event)) {
  faults.throw('axon.invalidArgument.bothTaskIdAndEventIdRequired')
}

if (publicUser.c_invite !== 'invited') {
  const searchPublicUser = _.pick(publicUser, 'c_username', 'c_mobile', 'c_email')
  // if it's not an invite, check if an invite exists for this username
  if (!_.isEmpty(searchPublicUser)) {
    const publicUsersCursor = c_public_users
      .find(searchPublicUser)
      .skipAcl()
      .grant(consts.accessLevels.read)
      .expand('c_study', 'c_study.c_groups')

    if (publicUsersCursor.hasNext()) {
      // we found an invite so we're going to use that from now on
      // we save the temp ID so we can migrate all the responses later
      const newPu = publicUsersCursor.next()

      // if the submitted public use has a c_number and the one we found doesn't
      // take from the submitted
      if (publicUser.c_number && !newPu.c_number) {
        publicUserUpdate.c_number = publicUser.c_number
      }

      temporaryPublicUserID = publicUser._id
      publicUser = newPu

    }
  }
}

const allGroup = axonScriptLib.findAllGroup(study._id)

// study.c_group expansion is limited to 10 so make sure you have the whole list of groups
study.c_groups.data = c_groups.find({ c_study: study._id })
  .limit(1000)
  .skipAcl()
  .grant(consts.accessLevels.read)
  .toArray()

// Ensure you have a valid group to put this user into:
// either it was supplied during the invite
// else set the All group
publicUserUpdate.c_group = (publicUser.c_group && publicUser.c_group._id) || (allGroup && allGroup._id)

if (!publicUserUpdate.c_group) {
  faults.throw('axon.error.allGroupNotFound')
}

const c_group = study.c_groups.data.find(v => v._id.equals(publicUserUpdate.c_group))

if (!c_group) {
  faults.throw('axon.invalidArgument.validGroupRequired')
}

accountCreationData.roles = [consts.roles.c_study_participant]
accountCreationData.c_study_groups = [publicUserUpdate.c_group]
accountCreationData.c_enrollments = [{
  c_joined: moment()
    .utc()
    .format(),
  c_study: publicUser.c_study._id,
  c_group: publicUserUpdate.c_group
}]

if (!accountCreationData.locale && publicUser.c_locale) {
  accountCreationData.locale = publicUser.c_locale
}

if (!accountCreationData.tz && publicUser.c_tz) {
  accountCreationData.tz = publicUser.c_tz
}

if (isLoginMethodsAvailable) {
  accountCreationData.loginMethods = ['credentials']
}

const newAccount = accounts.register(accountCreationData, {
  skipNotification: true,
  skipVerification: true,
  verifyLocation: true
})

publicUserUpdate.c_account = newAccount._id
publicUserUpdate.c_state = 'authorized'
publicUserUpdate.c_invite = 'accepted'

if (accountCreationData.username) {
  publicUserUpdate.c_username = accountCreationData.username
}

if (accountCreationData.email) {
  publicUserUpdate.c_email = accountCreationData.email
}

let anchorDatesToPush
let flagsUpdate

// This is required because the auth task does not produce a task resposne yet
// we still want to be able to use the task to set a subject status
if (c_task) {
  const tasksCursor = c_tasks.find({ _id: c_task })
          .skipAcl()
          .grant(consts.accessLevels.read),
        task = tasksCursor.hasNext() && tasksCursor.next()

  if (task && task.c_type === 'authentication') {

    if (task.c_set_subject_status_success) {
      publicUserUpdate.c_status = task.c_set_subject_status_success
    }

    // also we need to set the anchor dates if configured
    const { AnchorDate } = require('c_anchor_dates')

    const { TASK_COMPLETION } = AnchorDate.TEMPLATE_TYPES

    const {
      _id: taskId,
      c_study: {
        _id: studyId
      }
    } = task

    const { _id: publicUserId } = publicUser

    const anchorDate = new AnchorDate({
      type: TASK_COMPLETION,
      taskId,
      publicUserId,
      studyId,
      // here we are sending as task response start date as the current date
      taskResponseStartDate: new Date()
        .toISOString()
    })

    const anchorDates = anchorDate.getAnchorDates()

    if (anchorDates.length) {
      anchorDatesToPush = { $push: { c_set_dates: anchorDates } }
      const updatedAnchorDates = anchorDates.map(v => v.c_template)
      script.fire('c_anchor_dates_did_change', publicUserId, updatedAnchorDates)
    }

    flagsUpdate = PatientFlagsLib.getFlagsUpdateForAuthTask(taskId, publicUserId)

    if (c_event) {
      AdvanceTaskScheduling.eventComplete(c_event)
    }
  }
}

const puUpdateBody = { $set: publicUserUpdate, ...anchorDatesToPush }

if (flagsUpdate) {
  if (flagsUpdate.$set) {
    puUpdateBody.$set = { ...puUpdateBody.$set, ...flagsUpdate.$set }
  }

  if (flagsUpdate.$push) {
    if (!puUpdateBody.$push) {
      puUpdateBody.$push = flagsUpdate.$push
    } else {
      puUpdateBody.$push = { ...puUpdateBody.$push, ...flagsUpdate.$push }
    }
  }
}

publicUser = c_public_users.updateOne({ _id: publicUser._id }, puUpdateBody)
  .skipAcl()
  .grant(consts.accessLevels.update)
  .lean(false)
  .execute()

// We took the subject number from the submitted user and set that. now remove it from the old PU
if (publicUserUpdate.c_number) {
  c_public_users.updateOne({ _id: temporaryPublicUserID }, { $unset: { c_number: 1 } })
    .skipAcl()
    .grant(consts.accessLevels.update)
    .lean(false)
    .execute()
}
const relatedPublicUsersList = []
// here we made sure that we get the temp PU ID and use it in consolidating all the responses
if (temporaryPublicUserID) {
  relatedPublicUsersList.push(temporaryPublicUserID)
}

axonScriptLib.linkPublicUserResponses(publicUser, newAccount._id, relatedPublicUsersList)

script.exit({ account: newAccount, c_public_user: publicUser, c_group })

function validateRouteParams(accountCreationData) {
  // Check received parameters
  if (!accountCreationData) {
    faults.throw('axon.invalidArgument.accountRegistrationDataRequired')
  }

  if (accountCreationData.token) {
    accountCreationData = Object.assign({}, account)
    delete accountCreationData.token
  }

  const publicUserCursor = c_public_users
    .find({ _id: c_public_user })
    .skipAcl()
    .grant(consts.accessLevels.read)
    .expand('c_study', 'c_study.c_groups')

  if (!publicUserCursor.hasNext()) {
    faults.throw('axon.invalidArgument.validSubjectRequired')
  }

  const publicUser = publicUserCursor.next()

  if (publicUser.c_account) {
    faults.throw('axon.invalidArgument.publicUserExists')
  }

  if (publicUser.c_study.c_pinned_version >= 40000) {
    faults.throw('axon.accessDenied.useNewVersion')
  }

  if (publicUser.c_study.c_requires_invite && !publicUser.c_invite_validated) {
    faults.throw('axon.validation.inviteNotValidated')
  }

  if (publicUser.c_email && account.email && (publicUser.c_email.toLowerCase() !== account.email.toLowerCase())) {
    faults.throw('axon.invalidArgument.noInviteForEmail')
  }

  const subjectInviteValidation = publicUser.c_study.c_subject_invite_validation || 'pin_only'
  switch (subjectInviteValidation) {
    case 'mobile_pin': {
      if (publicUser.c_mobile && account.mobile && (publicUser.c_mobile.toLowerCase() !== account.mobile.toLowerCase())) {
        faults.throw('axon.invalidArgument.noInviteForMobile')
      }
      break
    }

    case 'username_pin': {
      if (publicUser.c_username && account.username && (publicUser.c_username.toLowerCase() !== account.username.toLowerCase())) {
        faults.throw('axon.invalidArgument.noInviteForUsername')
      }
      break
    }
  }

  return { publicUser, study: publicUser.c_study, accountCreationData }

}