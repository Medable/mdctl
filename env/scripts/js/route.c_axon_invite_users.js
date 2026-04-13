/* eslint-disable no-inner-declarations */
/***********************************************************

@script     Axon - Invite Users

@brief      Route to invite users to a study

@body
    emails: comma separated list of emails (string)
    c_group: participant group _id
    c_site: the _id of the site the user is connected to (optional)
    c_visit_schedule: the _id of the visit schedule the user is connected to (optional)
    locale: the locale to send the invitations in.

@version    4.5.0         (Medable.MIL)

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import faults from 'c_fault_lib'
import notifications from 'notifications'
import script from 'script'
import request from 'request'
import NucleusUtils from 'c_nucleus_utils'
import axonLib from 'c_axon_script_lib'
import { rBool } from 'util.values'
import { debug } from 'logger'

const { accounts, c_groups, c_public_users, c_sites, c_visit_schedules, c_studies } = org.objects,
      // eslint-disable-next-line no-useless-escape
      emailValidationRegex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/

let { c_group, c_site, c_visit_schedule, emails, c_public_user, locale = '', c_username, c_mobile } = request.body
const allowedRoles = ['Administrator', 'Site User', 'Site Investigator', 'Axon Site User', 'Axon Site Investigator'],
      // get the users roles
      roles = NucleusUtils.getUserRolesSimple(script.principal._id, c_site)
        .map(v => v.toString()),
      // get the ids of the allowed roles
      aRoleIds = allowedRoles.map(v => consts.roles[v].toString()),
      // check if the user roles are in the granted roles
      granted = aRoleIds.some(r => roles.indexOf(r) >= 0)

if (!granted) {
  faults.throw('axon.accessDenied.routeAccessDenied')
}

const { email, mobile, study } = validateRouteParams()

if (!study.c_requires_invite) {
  faults.throw('axon.validationError.studyInviteNotRequired')
}

const subjectInviteValidation = study.c_subject_invite_validation || 'pin_only'
const shouldStoreInviteData = rBool(study.c_store_invite_data, true)
const inviteCodeTtl = study.c_invite_code_ttl
const enableAltReg = study.c_enable_alt_reg

switch (subjectInviteValidation) {
  case 'email_pin': {
    function validateEmails() {
      if (!emails) {
        faults.throw('axon.invalidArgument.emailQuantityError')
      }
      // Validate inputs
      if (emails.length < 1 || emails.length >= 100) {
        faults.throw('axon.invalidArgument.emailQuantityError')
      }
    }
    function addEmail(publicUser, email) {
      publicUser.c_email = email
    }
    function returnEmail(emailParam) {
      if (emailParam) {
        return { email: emailParam }
      } else {
        return { email }
      }

    }

    return processUserInvite(
      emails,
      validateEmails,
      undefined,
      addEmail,
      returnEmail
    )
  }
  case 'mobile_pin': {
    return processUserInvite(
      c_mobile,
      () => validateRequiredParam(c_mobile, 'axon.invalidArgument.mobileNumberIsRequired')
    )
  }
  case 'username_pin': {
    function addUsernameProperty(publicUser) {
      if (shouldStoreInviteData) {
        publicUser.c_username = c_username
      }
    }
    function returnUsername() {
      return { username: c_username }
    }
    return processUserInvite(
      c_username,
      () => validateRequiredParam(c_username, 'axon.invalidArgument.usernameIsRequired'),
      addUsernameProperty,
      addUsernameProperty,
      returnUsername
    )
  }
  case 'pin_only': {
    return processUserInvite(
      undefined,
      () => {}
    )
  }

  default:
    return faults.throw('axon.unsupportedOperation.notImplemented')
}

function validateRouteParams() {
  if (!c_group) {
    faults.throw('axon.invalidArgument.validGroupRequired')
  }
  let email = null
  if (emails) {
    emails = (Array.isArray(emails) ? emails : [emails]).map(e => e.toLowerCase())
    email = emails[0]
    emails.forEach(email => {
      if (!emailValidationRegex.test(email)) {
        faults.throw('axon.invalidArgument.validEmailRequired')
      }

      if (hasAtleastOneResult(accounts, { email })) {
        faults.throw('axon.invalidArgument.accountExistsForEmail')
      }

      if (hasAtleastOneResult(c_public_users, { c_email: email })) {
        faults.throw('axon.invalidArgument.InviteAlreadySent')
      }
    })
  }
  let mobile = null
  if (c_mobile) {
    mobile = c_mobile
  }

  if (c_site && !hasAtleastOneResult(c_sites, { _id: c_site })) {
    faults.throw('axon.invalidArgument.validSiteRequired')
  }

  if (c_visit_schedule && !hasAtleastOneResult(c_visit_schedules, { _id: c_visit_schedule })) {
    faults.throw('axon.invalidArgument.validVisitScheduleRequired')
  }

  const groupCursor = cursorForOne(c_groups, { _id: c_group })
    .paths('c_study')
  if (!groupCursor.hasNext()) {
    faults.throw('axon.invalidArgument.validGroupRequired')
  }
  // Send Invitations
  const group = groupCursor.next(),
        study = cursorForOne(c_studies, { _id: group.c_study._id })
          .paths(
            'c_name',
            'c_default_subject_visit_schedule',
            'c_default_subject_visit_schedule',
            'c_supported_locales',
            'c_subject_invite_validation',
            'c_store_invite_data',
            'c_invite_code_ttl',
            'c_enable_alt_reg',
            'c_requires_invite'
          )
          .next()

  // if locale not specified then default study, otherwise to org
  if (!locale) {
    locale = (study.c_supported_locales && study.c_supported_locales[0]) || org.objects.org.find()
      .next().locale
  }
  return { email, mobile, study }
}

function processUserInvite(
  inviteParam,
  validateInviteParams,
  addUpdateProperties = () => {},
  addCreateProperties = () => {},
  addReturnValues = () => undefined
) {
  // validate invite parameters.

  validateInviteParams()
  // Update public user.

  if (c_public_user) {
    return updatePublicUser(
      addUpdateProperties,
      addReturnValues
    )
  }

  // Create public user.
  if (Array.isArray(inviteParam)) {
    return inviteParam.map(p => mapPublicUser(
      p,
      addCreateProperties,
      addReturnValues
    ))
  } else {
    return createPublicUser(
      addCreateProperties,
      addReturnValues
    )
  }
}

function updatePublicUser(
  addUpdateProperties,
  addReturnValues
) {
  // Inviting a user that was not previously invited, e.g. was added through
  // "create user".
  const publicUserCursor = cursorForOne(c_public_users, { _id: c_public_user })
    .locale(locale)
    .expand('c_study')

  if (!publicUserCursor.hasNext()) {
    faults.throw('axon.invalidArgument.validSubjectRequired')
  }

  let publicUser = publicUserCursor.next()

  if (publicUser.c_account) {
    faults.throw('axon.invalidArgument.subjectRegistered')
  }

  const publicUserUpdate = {
    c_last_invite_time: new Date()
      .toISOString(),
    c_invite: 'invited',
    c_access_code: generatePinCode(),
    c_locale: locale
  }

  addUpdateProperties(publicUserUpdate)

  if (shouldStoreInviteData) {
    if (email) {
      publicUserUpdate.c_email = email
    }
    if (mobile) {
      publicUserUpdate.c_mobile = mobile
    }
  }
  updatePinExpiry(publicUserUpdate)
  if (c_visit_schedule) {
    publicUserUpdate.c_visit_schedule = c_visit_schedule
  }

  if (c_group) {
    publicUserUpdate.c_group = c_group
  }

  publicUser = c_public_users.updateOne({
    _id: publicUser._id
  }, {
    $set: publicUserUpdate
  })
    .skipAcl()
    .grant(consts.accessLevels.delete)
    .lean(false)
    .execute()

  sendInvite(publicUser)

  return {
    c_public_user: publicUser._id,
    email,
    mobile,
    ...addReturnValues()
  }
}

function createPublicUser(
  addCreateProperties,
  addReturnValues
) {
  function createProperties(publicUserCreation) {
    addCreateProperties(publicUserCreation)

    if (mobile) {
      publicUserCreation.c_mobile = mobile
    }
    if (email) {
      publicUserCreation.c_email = email
    }
  }
  function returnValues() {
    return {
      email,
      mobile,
      ...addReturnValues()
    }
  }
  return mapPublicUser(
    undefined,
    createProperties,
    returnValues
  )
}

function mapPublicUser(
  inviteParam,
  addCreateProperties,
  addReturnValues
) {
  const publicUserCreation = {
    c_group,
    c_study: study._id,
    c_invite: 'invited',
    c_last_invite_time: new Date()
      .toISOString(),
    c_access_code: generatePinCode(),
    c_locale: locale
  }

  addCreateProperties(publicUserCreation, inviteParam)

  if (c_site) {
    publicUserCreation.c_site = c_site
  } else if (study.c_default_subject_site) {
    publicUserCreation.c_site = study.c_default_subject_site
  }
  updatePinExpiry(publicUserCreation)
  if (c_visit_schedule) {
    publicUserCreation.c_visit_schedule = c_visit_schedule
  } else if (study.c_default_subject_visit_schedule) {
    publicUserCreation.c_visit_schedule = study.c_default_subject_visit_schedule
  }

  const publicUser = c_public_users.insertOne(publicUserCreation)
    .skipAcl()
    .grant(consts.accessLevels.delete)
    .lean(false)
    .execute()

  sendInvite(publicUser)

  return {
    c_public_user: publicUser._id,
    ...addReturnValues(inviteParam)
  }
}

// Helper function for checking if objects exists.
function hasAtleastOneResult(object, query) {
  return cursorForOne(object, query)
    .paths('_id')
    .hasNext()
}

// Helper for common query-one case.
function cursorForOne(object, query) {
  return object.find(query)
    .limit(1)
    .skipAcl()
    .grant(consts.accessLevels.read)
}

// Send an invite to a specific user.
function sendInvite(publicUser) {

  const emailRecipient = email || publicUser.c_email
  const mobileRecipient = mobile || publicUser.c_mobile
  const username = c_username || publicUser.c_username
  const { downloadText, appleStore, googleStore } = axonLib.findMobileAppLVersion()
  const { appleStore_url, googleStore_url, isChina } = axonLib.findMobileAppLinks()()

  if (emailRecipient) {
    notifications.send('c_axon_invite-access_code', {
      email: subjectInviteValidation === 'email_pin' && emailRecipient,
      username: subjectInviteValidation === 'username_pin' && username,
      mobile: subjectInviteValidation === 'mobile_pin' && mobileRecipient,
      study_name: study.c_name,
      access_code: publicUser.c_access_code,
      paweb_url: axonLib.getPatientAppWebURL(),
      downloadText,
      appleStore,
      appleStore_url,
      googleStore_url,
      googleStore: googleStore && !isChina
    }, {
      locale,
      recipient: emailRecipient
    })
  }

  if (mobileRecipient) {

    notifications.send(
      {
        email: subjectInviteValidation === 'email_pin' && emailRecipient,
        username: subjectInviteValidation === 'username_pin' && username,
        mobile: subjectInviteValidation === 'mobile_pin' && mobileRecipient,
        study_name: study.c_name,
        access_code: publicUser.c_access_code,
        paweb_url: axonLib.getPatientAppWebURL()
      },
      {
        endpoints: {
          sms: { mobile: mobileRecipient, template: 'c_axon_sms-invite_users' }
        },
        locale: publicUser.c_locale
      }
    )
  }
}

function validateRequiredParam(param, errorCode) {
  if (!param) {
    faults.throw(errorCode)
  }
}

function updatePinExpiry(pu) {
  if (inviteCodeTtl && inviteCodeTtl > 0) {
    const nowMillis = new Date()
      .getTime()
    const ttlMillis = inviteCodeTtl * 60 * 1000
    pu.c_pin_expiry_time = nowMillis + ttlMillis
  }
}

function generatePinCode() {
  return axonLib.generateRandomDigitSequence(6)
}