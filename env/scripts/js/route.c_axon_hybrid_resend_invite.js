/***********************************************************

@script     Axon - Resend Invite

@brief      Route to resend an invite

@parameter
    c_site: the site of the subject(either this or c_study is required)
    c_study: the study of the subject (either this or c_site is required)
    c_public_user: cid of the public user to resent the invite to
    c_email: an updated email address
    locale: the locale to send the invitations in.

@version    4.5.0         (Medable.MIL)

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import faults from 'c_fault_lib'
import notifications from 'notifications'
import request from 'request'
import NucleusUtils from 'c_nucleus_utils'
import { rBool } from 'util.values'
import { getPatientAppWebURL, generateRandomDigitSequence, findMobileAppLVersion, findMobileAppLinks } from 'c_axon_script_lib'

const { c_public_users, c_studies, c_sites } = org.objects,
      { c_public_user, c_site, c_email, locale = '', c_mobile } = request.query,
      allowedRoles = ['Administrator', 'Developer', 'Site User', 'Site Investigator', 'Axon Site User', 'Axon Site Investigator'],
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

const searchQuery = { _id: c_public_user }

// We have to ensure that this user can only make requests from the site or study that they are using so we add them to the search query
// for the public user
if (c_site) {
  // set query to check on the site
  if (c_sites.find({ _id: c_site })
    .skipAcl()
    .grant(consts.accessLevels.read)
    .hasNext()) {
    searchQuery.c_site = c_site
  } else {
    faults.throw('axon.invalidArgument.validSiteRequired')
  }

}

// The search query process is primarily to stop a site user from one site resending an invite for a user of another
const publicUserCursor = c_public_users.find(searchQuery)
  .limit(1)
  .skipAcl()
  .grant(consts.accessLevels.read)

if (!c_public_user || !publicUserCursor.hasNext()) {
  faults.throw('axon.invalidArgument.validSubjectRequired')
}

let publicUser = publicUserCursor.next(),
    study = c_studies.find()
      .locale(locale)
      .skipAcl()
      .grant(consts.accessLevels.read)
      .next(),
    storeInviteData = rBool(study.c_store_invite_data, true),
    inviteCodeTtl = study.c_invite_code_ttl,
    enableAltReg = study.c_enable_alt_reg

if (publicUser.c_invite === 'accepted') {
  faults.throw('axon.invalidArgument.cannotResentAccepted')
}

// update the public user as necessary
let c_last_invite_time = new Date()
      .toISOString(),
    publicUserUpdate = { c_invite: 'invited', c_last_invite_time }

if (locale) {
  publicUserUpdate = { ...publicUserUpdate, c_locale: locale }
}

// if it was requested, we save the resent invite data
if (storeInviteData) {
  if (c_email) {
    publicUserUpdate.c_email = c_email
  }
  if (c_mobile) {
    publicUserUpdate.c_mobile = c_mobile
  }
}
// Update both access code & expiry date
publicUserUpdate.c_access_code = generatePinCode()
if (inviteCodeTtl && inviteCodeTtl > 0) {
  const nowMillis = new Date()
    .getTime()
  const ttlMillis = inviteCodeTtl * 60 * 1000
  publicUserUpdate.c_pin_expiry_time = nowMillis + ttlMillis
}
publicUser = c_public_users.updateOne({ _id: c_public_user }, { $set: publicUserUpdate })
  .skipAcl()
  .grant(consts.accessLevels.update)
  .lean(false)
  .execute()

// Get patient app web url
const paweb_url = getPatientAppWebURL()
const { downloadText, appleStore, googleStore } = findMobileAppLVersion()
const { appleStore_url, googleStore_url, isChina } = findMobileAppLinks()()

// send the notification to email
if (c_email) {
  notifications.send('c_axon_invite-access_code', {
    email: study.c_subject_invite_validation === 'email_pin' && publicUser.c_email,
    username: study.c_subject_invite_validation === 'username_pin' && publicUser.c_username,
    mobile: study.c_subject_invite_validation === 'mobile_pin' && publicUser.c_mobile,
    study_name: study.c_name,
    access_code: publicUser.c_access_code,
    paweb_url,
    downloadText,
    appleStore,
    googleStore: googleStore && !isChina,
    appleStore_url,
    googleStore_url
  }, { recipient: c_email, locale })
}
if (c_mobile) {
  notifications.send(
    {
      email: study.c_subject_invite_validation === 'email_pin' && publicUser.c_email,
      username: study.c_subject_invite_validation === 'username_pin' && publicUser.c_username,
      mobile: study.c_subject_invite_validation === 'mobile_pin' && publicUser.c_mobile,
      study_name: study.c_name,
      access_code: publicUser.c_access_code,
      paweb_url
    },
    {
      endpoints: {
        sms: { mobile: c_mobile, template: 'c_axon_sms-invite_users' }
      },
      locale: publicUser.c_locale
    }
  )
}

return publicUser

function generatePinCode() {
  return generateRandomDigitSequence(6)
}