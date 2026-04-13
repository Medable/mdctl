import {
  log,
  route
} from 'decorators'

import faults from 'c_fault_lib'
import { isIdFormat } from 'util.id'
import { runnerIsAdmin, isSiteUser } from 'c_nucleus_utils'

import { WsClientToken, getWsEndpoint } from 'c_participant_websockets'
import axonScriptLib from 'c_axon_script_lib'
import moment from 'moment'
const RegistrationValidator = require('c_axon_registration_validator')

const { accessLevels } = consts

const {
  c_public_users,
  c_caregiver_relationships,
  accounts
} = org.objects

function getPublicUser(publicUserId) {
  if (publicUserId && !isIdFormat(publicUserId)) {
    faults.throw('axon.invalidArgument.invalidObjectId')
  }
  const publicUserCursor = c_public_users.find({ _id: publicUserId })
    .grant(accessLevels.read)
    .expand('c_caregiver_relationship')
    .skipAcl()
    .grant(accessLevels.read)
  if (!publicUserCursor.hasNext()) {
    faults.throw('axon.invalidArgument.validSubjectRequired')
  }
  const publicUser = publicUserCursor.next()
  return publicUser
}

function getCaregiverRelationship(publicUserId) {
  const relationshipsCursor = c_caregiver_relationships.find({
    $or: [
      { c_client: publicUserId },
      {
        c_caregivers_info: {
          $elemMatch: {
            c_public_user: publicUserId
          }
        }
      }]
  })
    .expand(['c_client', 'c_caregivers_info.c_public_user'])
    .skipAcl()
    .grant(consts.accessLevels.read)

  return relationshipsCursor.hasNext() && relationshipsCursor.next()
}

class ParticipantLibrary {

  @log({ traceError: true })
  @route({
    method: 'GET',
    name: 'c_websocket_user_token',
    path: 'c_public_users/:publicUserId/websocket/token',
    acl: ['account.public']
  })
  static getWebsocketUserToken({
    req,
    body
  }) {
    const { publicUserId } = req.params

    const publicUser = getPublicUser(publicUserId)

    const caregiverRelationship = getCaregiverRelationship(publicUserId)

    const userAccount = accounts.find({ _id: script.principal._id }).include('c_public_users').next()
    const callerPublicUserId = userAccount.c_public_users && userAccount.c_public_users.data.length && userAccount.c_public_users.data[0]._id

    const principalIsUser = publicUser.c_account && publicUser.c_account._id.equals(script.principal._id)
    const isRelatedUser = caregiverRelationship && callerPublicUserId && !!caregiverRelationship.c_caregiver_assignments.find(v => v.equals(callerPublicUserId))

    if (!runnerIsAdmin() && !principalIsUser && !isRelatedUser && !isSiteUser()) {
      return faults.throw('axon.accessDenied.routeAccessDenied')
    }

    const { env: { host } } = script

    const jwt = new WsClientToken('c_websocket_issuer', script.principal._id)

    jwt.pubsub('c_public_user', publicUserId)

    const endpoint = getWsEndpoint(host)
    const token = jwt.generate(84000)

    return {
      endpoint,
      token
    }
  }

  @log({ traceError: true })
  @route({
    method: 'POST',
    name: 'c_axon_participant_registration',
    path: 'participant/register',
    acl: ['account.anonymous']
  })
  static registerUser({
    req,
    body
  }) {
    const {
      account: accountData,
      c_public_user: publicUserId
    } = body()
    const publicUserUpdate = {}
    const accountCreationData = {}
    let study
    const publicUserCursor = c_public_users
      .find({ _id: publicUserId })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .expand('c_study', 'c_study.c_groups', 'c_site')

    if (!publicUserCursor.hasNext()) {
      faults.throw('axon.invalidArgument.validSubjectRequired')
    }
    const publicUser = publicUserCursor.next()
    study = publicUser.c_study

    if (study.c_pinned_version < 40000) {
      faults.throw('axon.accessDenied.notSupportedVersion')
    }
    if (publicUser.c_account) {
      faults.throw('axon.invalidArgument.publicUserExists')
    }
    if (publicUser.c_study.c_requires_invite && !publicUser.c_invite_validated) {
      faults.throw('axon.validation.inviteNotValidated')
    }

    // Use universal validator
    const validationResult = RegistrationValidator.validateRegistration(
      study,
      publicUser.c_site,
      publicUser,
      accountData.email,
      accountData.username
    )

    if (!accountData.password) {
      faults.throw('axon.invalidArgument.passwordRequired')
    }

    const allGroup = axonScriptLib.findAllGroup(study._id)
    publicUserUpdate.c_group = (publicUser.c_group && publicUser.c_group._id) || (allGroup && allGroup._id)

    if (!publicUserUpdate.c_group) {
      faults.throw('axon.error.allGroupNotFound')
    }

    // Use validation result to determine identifier type FIRST
    if (validationResult.shouldUseEmail) {
      accountCreationData.email = accountData.email
    } else if (validationResult.shouldUseUsername) {
      accountCreationData.username = accountData.username
    }

    // Check c_auth_task_fields based on what identifier we're actually using
    // Use validator to determine if PII fields should be bypassed
    const shouldBypassPiiFields = RegistrationValidator.shouldBypassPiiFields(study, publicUser.c_site, publicUser)
    const authTaskFields = study.c_auth_task_fields || []

    authTaskFields.forEach(field => {
      // Skip PII fields when bypass is enabled
      if (shouldBypassPiiFields && ['email', 'name', 'mobile'].includes(field)) {
        return
      }

      switch (field) {
        case 'name':
          if (!(
            typeof accountData.name === 'object' &&
            accountData.name.first &&
            accountData.name.last)) {
            faults.throw('axon.invalidArgument.nameRequired')
          }
          break
        case 'username':
          // Only require username if we're actually using username (not email)
          if (validationResult.shouldUseUsername && !accountData.username) {
            faults.throw('axon.invalidArgument.usernameRequired')
          }
          break
        case 'email':
          // Only require email if we're actually using email (not username)
          if (validationResult.shouldUseEmail && !accountData.email) {
            faults.throw('axon.invalidArgument.emailRequired')
          }
          break
        case 'mobile':
          if (!accountData.mobile) {
            faults.throw('axon.invalidArgument.mobileRequired')
          }
          break
      }
    })

    if (accountData.mobile) {
      accountCreationData.mobile = accountData.mobile
    }

    if (!accountData.locale && publicUser.c_locale) {
      accountCreationData.locale = publicUser.c_locale
    } else {
      accountCreationData.locale = accountData.locale
    }

    if (!accountData.tz && publicUser.c_tz) {
      accountCreationData.tz = publicUser.c_tz
    } else {
      accountCreationData.tz = accountData.tz
    }

    accountCreationData.password = accountData.password
    accountCreationData.roles = [consts.roles.c_study_participant]
    accountCreationData.c_study_groups = [publicUserUpdate.c_group]
    accountCreationData.c_enrollments = [
      {
        c_joined: moment()
          .utc()
          .format(),
        c_study: publicUser.c_study._id,
        c_group: publicUserUpdate.c_group
      }
    ]

    if (accountData.name &&
      typeof accountData.name === 'object' &&
      accountData.name.first &&
      accountData.name.last) {
      accountCreationData.name = accountData.name
    }

    // Register the new account
    const newAccount = accounts.register(accountCreationData, {
      skipNotification: true,
      skipVerification: true,
      verifyLocation: true
    })
    publicUserUpdate.c_account = newAccount._id
    publicUserUpdate.c_state = 'authorized'
    publicUserUpdate.c_invite = 'accepted'
    publicUserUpdate.c_locale = newAccount.locale
    publicUserUpdate.c_tz = newAccount.tz
    if (validationResult.shouldUseUsername && accountCreationData.username) {
      publicUserUpdate.c_username = accountCreationData.username
    }
    if (validationResult.shouldUseEmail && newAccount.email) {
      publicUserUpdate.c_email = newAccount.email
    }
    // Update the public user
    const updatedPublicUser = c_public_users
      .updateOne({ _id: publicUser._id }, { $set: publicUserUpdate })
      .skipAcl()
      .grant(consts.accessLevels.update)
      .execute()

    return ({
      account: newAccount,
      c_public_user: updatedPublicUser
    })
  }

}

module.exports = ParticipantLibrary