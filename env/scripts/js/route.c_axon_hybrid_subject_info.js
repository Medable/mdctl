/***********************************************************

@script     Axon - Hybrid - Subject Info

@brief      Route to return the study subject information or create a new subject if no parameters supplied

@body
    c_invite_token: invite token
    c_public_user: the _id public user
    c_study: the study ID, requred if neitehr of the first 2 parameters are supplied

@version    4.5.0

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import request from 'request'
import moment from 'moment'
import _ from 'underscore'
import logger from 'logger'
import faults from 'c_fault_lib'
import c_nuc_utils from 'c_nucleus_utils'

const { c_public_users, c_studies, c_groups, objects, c_sites } = org.objects,
      publicStudyProperties = objects
        .find({ name: 'c_study' })
        .paths('properties.name', 'properties.acl')
        .next()
        .properties.reduce((a, v) => {
          if (v.acl && v.acl.find(acl => (acl.type === 1 && acl.target.equals('000000000000000000000001') && acl.allow === 4))) {
            a.push(v.name)
          }
          return a
        }, [])

const { c_public_user, c_study, c_access_code, c_email, c_mobile, c_username } = request.query

const { study, groups } = validateRouteParams()
const subjectInviteValidation = study.c_subject_invite_validation || 'pin_only'

switch (subjectInviteValidation) {
  case 'email_pin': {
    return processSubjectInfoRequest(
      c_email ? c_email.toLowerCase() : null,
      'c_email',
      'axon.invalidArgument.emailAccessCodeDontMatch',
      'axon.invalidArgument.emailAndAccessCodeRequired',
      (!c_access_code && c_email) || (c_access_code && !c_email)
    )
  }

  case 'mobile_pin': {
    return processSubjectInfoRequest(
      c_mobile,
      'c_mobile',
      'axon.invalidArgument.mobileAccessCodeDontMatch',
      'axon.invalidArgument.mobileAndAccessCodeRequired',
      (!c_access_code && c_mobile) || (c_access_code && !c_mobile)
    )
  }

  case 'username_pin': {
    return processSubjectInfoRequest(
      c_username,
      'c_username',
      'axon.invalidArgument.usernameAccessCodeDontMatch',
      'axon.invalidArgument.usernameAndAccessCodeRequired',
      (!c_access_code && c_username) || (c_access_code && !c_username)
    )
  }

  case 'pin_only': {
    return processSubjectInfoRequest(
      c_access_code,
      'c_access_code',
      'axon.invalidArgument.accessCodeDontMatch',
      'axon.invalidArgument.accessCodeRequired',
      !c_access_code
    )
  }

  default:
    return faults.throw('axon.unsupportedOperation.notImplemented')
}

function validateRouteParams() {
  if (!c_study) {
    faults.throw('axon.invalidArgument.validStudyRequired')
  }

  const studyCursor = c_studies.find({ _id: c_study })
          .skipAcl()
          .grant(consts.accessLevels.read)
          .expand('c_groups'),
        study = studyCursor.hasNext() && studyCursor.next()
  if (!study) {
    faults.throw('axon.invalidArgument.validStudyRequired')
  }

  const groups = c_groups.find({ c_study: study._id })
    .skipAcl()
    .grant(consts.accessLevels.read)
    .toArray()

  return { study, groups }
}

function processSubjectInfoRequest(
  paramValue,
  paramName,
  donnotMatchErrorCode,
  requiredErrorCode,
  requiredValidationCondition
) {
  // Study is the only passed parameter
  if (!c_public_user && !c_access_code && !paramValue) {

    // We need a valid study ID to proceed

    if (study.c_requires_invite) {
      // tell the app an email and access code is necessary by returning the study requires invite parameter
      return { c_study: _.pick(study, '_id', 'object', 'c_requires_invite', publicStudyProperties) }
    } else {
      // no invite required, lets create a public user for the app to use

      const defaultGroup = study.c_default_subject_group || groups.find(v => v.c_name === 'All')
      if (!defaultGroup) {
        faults.throw('axon.error.allGroupNotFound')
      }

      // Now start creating a new public user
      const publicUserCreation = { c_study: study._id, c_invite: 'none', c_group: defaultGroup._id }

      if (study.c_default_subject_site) {
        publicUserCreation.c_site = study.c_default_subject_site._id
      }

      if (study.c_default_subject_visit_schedule) {
        publicUserCreation.c_visit_schedule = study.c_default_subject_visit_schedule._id
      }

      const c_public_user = c_public_users.insertOne(publicUserCreation)
        .skipAcl()
        .grant(consts.accessLevels.script)
        .lean(false)
        .execute()

      return {
        c_public_user,
        c_study: _.pick(study, '_id', 'object', 'c_requires_invite', publicStudyProperties),
        c_site: getSiteFromPublicUser(c_public_user)
      }

    }

  } else if (c_access_code && paramValue) {
    // email and access code provided
    const publicUserCursor = c_public_users.find({ c_access_code, [paramName]: paramValue })
            .skipAcl()
            .grant(consts.accessLevels.read)
            .transform({ script: 'c_invite_expiry_transform' }),
          publicUser = publicUserCursor.hasNext() && publicUserCursor.next(),
          // only get the connection if no account is attached (invite not yet accepted)
          returnData = {
            c_public_user: publicUser,
            c_study: _.pick(study, '_id', 'object', 'c_requires_invite', publicStudyProperties),
            c_site: getSiteFromPublicUser(publicUser)
          }

    if (!publicUser) {
      faults.throw(donnotMatchErrorCode)
    }

    if (publicUser.c_invite === 'expired') {
      faults.throw('axon.expired.invitationExpired')
    }
    // Check if pin code has expired.
    if (study.c_invite_code_ttl !== -1) {
      if (new Date()
        .getTime() > new Date(publicUser.c_pin_expiry_time)
        .getTime()) {
        faults.throw('axon.expired.pinCodeExpired')
      }
    }

    returnData.connection = {
      _id: '000000000000000000000000',
      access: 0,
      created: '2000-01-01T00:00:00.000Z',
      object: 'connection',
      token: c_access_code
    }

    c_public_users.updateOne({ _id: publicUser._id }, { $set: { c_invite_validated: true } })
      .skipAcl()
      .grant(consts.accessLevels.update)
      .execute()

    return returnData

  } else if (c_public_user) {
    // With just the public user Id, get the public user object and the related connection if it exists
    const publicUserCursor = c_public_users.find({ _id: c_public_user })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .transform({ script: 'c_invite_expiry_transform' })

    const publicUser = publicUserCursor.hasNext() && publicUserCursor.next()

    if (publicUser) {
      // only get the connection if no account is attached (invite not yet accepted)
      return {
        c_public_user: publicUser,
        c_study: _.pick(study, '_id', 'object', 'c_requires_invite', publicStudyProperties),
        c_site: getSiteFromPublicUser(publicUser)
      }
    } else {
      faults.throw('axon.invalidArgument.subjectNotFound')
    }

  } else if (requiredValidationCondition) {
    // jsut to double check people aren't sending one or the other
    faults.throw(requiredErrorCode)
  } else {
    faults.throw('axon.invalidArgument.subjectNotFound')
  }
}

function getSiteFromPublicUser(publicUser) {
  if (!publicUser.c_site) {
    return undefined
  }
  const siteId = publicUser.c_site._id
  const siteCursor = c_sites.find({ _id: siteId })
    .skipAcl()
    .grant(consts.accessLevels.read)
  return siteCursor.hasNext() ? siteCursor.next() : undefined
}