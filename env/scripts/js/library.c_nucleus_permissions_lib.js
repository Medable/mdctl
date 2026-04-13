/***********************************************************

@script     Nucleus - Permission Script Library

@brief      Permissions functions used in Nucleus scripts

@author     Fiachra Matthews

@version    1.0.0

(c)2016-2018 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import logger from 'logger'
import _ from 'lodash'
import { acl } from 'decorators'
import cache from 'cache'
import faults from 'c_fault_lib'

const SystemUser = {
  email: 'system_user@medable.com',
  name: 'c_system_user'
}

const NewSiteAccountRoles = [
  'Axon Site User',
  'Axon Site Monitor',
  'Axon Site Auditor',
  'Axon Site Investigator'
]

let systemUserServiceAccount
let systemUserAccount
let accountsRequested = false

const PublicUserReviewStatusPermission = {
        Open: {
          systemOnly: false,
          roles: []
        },
        Review: {
          systemOnly: true,
          roles: []
        },
        Approved: {
          systemOnly: false,
          roles: [consts.roles['Site Investigator'], consts.roles['Axon Site Investigator']]
        }
      },

      PublicUserStatusPermission = {
        Enrolled: {
          systemOnly: true,
          roles: []
        },
        ScreenFailed: {
          systemOnly: true,
          roles: []
        },
        Completed: {
          systemOnly: true,
          roles: []
        },
        Discontinued: {
          systemOnly: true,
          roles: []
        }
      },

      TaskResponseStatusPermission = {
        New: {
          systemOnly: false,
          roles: []
        },
        Incomplete: {
          systemOnly: true,
          roles: []
        },
        Complete: {
          systemOnly: true,
          roles: []
        },
        Reviewed: {
          systemOnly: false,
          roles: [consts.roles['Data Manager']]
        },
        Inactive: {
          systemOnly: false,
          roles: [consts.roles['Site Investigator'], consts.roles['Axon Site Investigator'], consts.roles['Site User'], consts.roles['Axon Site User']]
        }
      },

      responseWriteRoleStrings = [
        'Site User',
        'Site Investigator'
      ],

      responseWriteNewSiteRoleStrings = [
        'Axon Site User',
        'Axon Site Investigator'
      ]

function objectDiff(o1, o2) {
  return Object.keys(o2)
    .reduce((diff, key) => {
      if (o1[key] === o2[key]) return diff
      return {
        ...diff,
        [key]: o2[key]
      }
    }, {})
}

function isSystemUserID(userID) {
  if (!accountsRequested) {
    systemUserServiceAccount = org.objects.org.find()
      .skipAcl()
      .grant(consts.accessLevels.read)
      .next().serviceAccounts.find(v => v.name === SystemUser.name)
    const suCursor = org.objects.accounts.find({ email: SystemUser.email })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .paths('_id')
    systemUserAccount = suCursor.hasNext() && suCursor.next()
    accountsRequested = true
  }
  return (systemUserAccount && systemUserAccount._id.equals(userID)) || (systemUserServiceAccount && systemUserServiceAccount._id.equals(userID))
}

function runnerIsAdmin() {
  // eslint-disable-next-line eqeqeq
  return script.principal.roles.find(v => v == `${consts.roles.Administrator}`)
}

function taskResponseDeactivating(taskResponseId) {
  const deactivateKey = 'Deactiviating-' + taskResponseId,
        isit = cache.has(deactivateKey)
  return cache.has(deactivateKey)
}

function checkCaregiverRelationship(clientPublicUser, submitterAccount, response) {
  const account = org.objects.accounts.readOne({ _id: submitterAccount._id })
    .expand('c_public_users')
    .throwNotFound(false)
    .execute()

  const responderUser = account && account.c_public_users.data[0]

  if (!responderUser) return false

  if (!responderUser._id.equals(response.c_responded_by._id)) return false

  const caregiverRelationship = org.objects.c_caregiver_relationship.readOne({ c_caregiver_assignments: responderUser._id })
    .throwNotFound(false)
    .execute()

  return caregiverRelationship && caregiverRelationship.c_client._id.equals(clientPublicUser._id)
}

function responseWritePermission(account, response) {
  let hasPermission = false

  // Task responses can be created by admins, and users creating task responses for themselves
  // We check that by comparing the script principal to response.c_account or response.public_user.c_account
  if (runnerIsAdmin()) {
    hasPermission = true
  } else if (response.c_account && account._id.equals(response.c_account._id)) {
    hasPermission = true
  } else if (response.c_public_user) {
    const pu = org.objects.c_public_user.readOne({ _id: response.c_public_user._id })
      .throwNotFound(false)
      .skipAcl()
      .grant(consts.accessLevels.read)
      .execute()

    if (pu && pu.c_account && account._id.equals(pu.c_account._id)) {
      hasPermission = true
    } else if (response.c_responded_by) {
      hasPermission = checkCaregiverRelationship(pu, account, response)
    }
  }

  // finally, if none of the above, we check if the creator is an approved create role for the specific site
  if (!hasPermission) {
    if (response.c_site) { // user is creating a resposne for a site
      const siteUserCursor = org.objects.c_site_user.find({ c_account: account._id, c_site: response.c_site._id })
              .limit(1)
              .paths(['c_role'])
              .skipAcl()
              .grant(consts.accessLevels.read),
            siteUser = (siteUserCursor.hasNext() && siteUserCursor.next()) || {}

      // the user has a response write role
      hasPermission = responseWriteRoleStrings.includes(siteUser.c_role)
      // check if user has new account level site role and if that site can be access by them
      if (!hasPermission) {
        hasPermission = canAccessSite(account, response.c_site._id)
      }
    }

  }

  return hasPermission
}

// check if account has access to siteId and has valid account site role
function canAccessSite(account, siteId) {
  const accountObj = org.objects.accounts.find({ _id: account._id })
    .skipAcl()
    .grant(consts.accessLevels.read)
    .expand('c_site_access_list')
    .next()
  const allowedSiteId = (accountObj.c_site_access_list && accountObj.c_site_access_list.map(v => v.toString())) || []
  const allowedRoleIds = responseWriteNewSiteRoleStrings.map(v => consts.roles[v].toString())
  return allowedSiteId.includes(siteId.toString()) && accountObj.roles.some(v => allowedRoleIds.includes(v.toString()))

}
function stepResponseCreatePermission(account, response) {
  let hasPermission = true

  if (runnerIsAdmin()) {
    return hasPermission
  }

  const tr = org.objects.c_task_responses.find({ _id: script.arguments.new.c_task_response._id })
    .skipAcl()
    .grant(consts.accessLevels.read)
    .paths('c_site', 'c_account', 'c_status')
    .next()

  if (tr.c_status === 'Inactive') {
    faults.throw('axon.accessDenied.cannotEditTask')
  }

  // the caller is creating a response for themselves
  if (tr.c_account && account._id.equals(tr.c_account._id)) {
    hasPermission = true
  } else if (tr.c_site) { // user is creating a resposne for a site
    const siteUserCursor = org.objects.c_site_user.find({ c_account: account._id, c_site: tr.c_site._id })
            .limit(1)
            .paths(['c_role'])
            .skipAcl()
            .grant(consts.accessLevels.read),
          siteUser = (siteUserCursor.hasNext() && siteUserCursor.next()) || {}

    // the user has a response write role
    hasPermission = responseWriteRoleStrings.includes(siteUser.c_role)
    // check if user has new account level site role and if that site can be access by them
    if (!hasPermission) {
      hasPermission = canAccessSite(account, tr.c_site._id)
    }
  }
  return hasPermission
}

function stepResponseEditPermission(account, response) {
  let hasPermission = true

  if (runnerIsAdmin()) {
    return hasPermission
  }

  const sr = script.as(SystemUser.name, {}, () => {
    return org.objects.c_step_response
      .find({ _id: response._id })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .paths('c_task_response.c_site', 'c_task_response.c_account', 'c_task_response.c_status', 'c_task_response.owner', 'c_task_response.creator')
      .passive()
      .next()
  })

  if (sr.c_task_response.c_status === 'Inactive' && !taskResponseDeactivating(sr.c_task_response._id)) {
    faults.throw('axon.accessDenied.cannotEditTask')
  }
  // the caller is creating a response for themselves
  if (sr.c_task_response.c_account && account._id.equals(sr.c_task_response.c_account._id)) {
    hasPermission = true
  } else if (!sr.c_task_response.creator || isSystemUserID(sr.c_task_response.creator._id) || (sr.c_task_response.c_account && sr.c_task_response.c_account._id.equals(sr.c_task_response.creator._id))) {
    // if
    // - the creator is anonymous (legacy public group) or
    // - the creator is the system user  (modern public group) or
    // - the creator and the account on the TR are the same person (standard logged in pat task)
    // in the above cases, the response is a patient app created response and is not editable
    faults.throw('axon.accessDenied.noEditPatientTasks')
  } else if (sr.c_task_response.c_site) { // user is creating a response for a site
    const siteUserCursor = org.objects.c_site_user.find({ c_account: account._id, c_site: sr.c_task_response.c_site._id })
            .limit(1)
            .paths(['c_role'])
            .skipAcl()
            .grant(consts.accessLevels.read),
          siteUser = (siteUserCursor.hasNext() && siteUserCursor.next()) || {}
    // the user has a response write role
    hasPermission = responseWriteRoleStrings.includes(siteUser.c_role)
    // check if user has new account level site role and if that site can be access by them
    if (!hasPermission) {
      hasPermission = canAccessSite(account, sr.c_task_response.c_site._id)
    }
  }
  return hasPermission
}

function taskResponseEditPermission(account, response) {
  let hasPermission = true

  if (runnerIsAdmin()) {
    return hasPermission
  }

  const tr = org.objects.c_task_response.find({ _id: response._id })
    .skipAcl()
    .grant(4)
    .paths('c_site', 'c_account', 'c_status')
    .next()

  if (tr.c_account && account._id.equals(tr.c_account._id)) {
    hasPermission = true
  } else if (tr.c_site) { // user is creating a resposne for a site
    const siteUserCursor = org.objects.c_site_user.find({ c_account: account._id, c_site: tr.c_site._id })
            .limit(1)
            .paths(['c_role'])
            .skipAcl()
            .grant(consts.accessLevels.read),
          siteUser = (siteUserCursor.hasNext() && siteUserCursor.next()) || {}
    // the user has a response write role
    hasPermission = responseWriteRoleStrings.includes(siteUser.c_role)
    // check if user has new account level site role and if that site can be access by them
    if (!hasPermission) {
      hasPermission = canAccessSite(account, tr.c_site._id)
    }

    const oldCopy = Object.assign({}, script.arguments.old),
          newResponse = Object.assign(oldCopy, script.arguments.new),
          onlyUpdated = objectDiff(script.arguments.old, newResponse) // this should be jsut the updated props

    // so far, permission to write has not been granted
    // check if a Data manager is trying to set the status
    if (!hasPermission) {

      // Data managers are allowed to set c_status. To which values then can set it are checked later
      // eslint-disable-next-line eqeqeq
      const isDMRoleInAccount = script.principal.roles.find(v => v == `${consts.roles['Data Manager']}`)
      const isDMRoleInSite = siteUser.c_role === 'Data Manager'
      const isDM = isDMRoleInSite || isDMRoleInAccount

      if (isDM && script.arguments.new.c_status) {
        // This checks that the status is the only prop they are trying to change
        hasPermission = Object.keys(onlyUpdated)
          .reduce((a, v) => {
            return a && ((v === 'c_status') || !(v.startsWith('c_')))
          }, true)
      }
    }
  }

  if (isSystemUserID(account._id)) {
    hasPermission = true
  }

  return hasPermission
}

function publicUserCreatePermission(account, publicUser) {
  let hasPermission = true

  if (runnerIsAdmin()) {
    return hasPermission
  }

  if (publicUser.c_site) { // user is creating a public user for a site
    const siteUserCursor = org.objects.c_site_user.find({ c_account: account._id, c_site: publicUser.c_site._id })
            .limit(1)
            .paths(['c_role'])
            .skipAcl()
            .grant(consts.accessLevels.read),
          siteUser = (siteUserCursor.hasNext() && siteUserCursor.next()) || {}

    // the user has a public user creation role
    hasPermission = responseWriteRoleStrings.includes(siteUser.c_role)
    // check if user has new account level site role and if that site can be access by them
    if (!hasPermission) {
      hasPermission = canAccessSite(account, publicUser.c_site._id)
    }
  }

  return hasPermission
}

function testPropertyPermission(originalPrincipal, principal, siteID, studyId, propertyPermission) {
  let hasPermission = true

  if (propertyPermission) {
    const roles = module.exports.getUserRoles(originalPrincipal._id, siteID, studyId),
          userRoleList = [...roles.c_accountRoles.map(r => r.toString()), ...roles.c_siteRoles.map(r => r.toString()), ...roles.c_studyRoles.map(r => r.toString())]

    if (propertyPermission.systemOnly) {
      if (!isSystemUserID(originalPrincipal._id)) {
        hasPermission = false
      }
    } else if (!(propertyPermission.roles.map(r => r.toString())
      .some(r => userRoleList.includes(r)))) {
      hasPermission = false
    }
  }

  return hasPermission
}

function publicUserSetReviewStatusPermission(originalPrincipal, principal, publicUserContext, updateInfo) {
  let hasPermission = true

  if (runnerIsAdmin()) {
    return hasPermission
  }

  const statusPermission = PublicUserReviewStatusPermission[updateInfo.c_review_status],
        publicUser = org.objects.c_public_users.find({ _id: publicUserContext._id })
          .skipAcl()
          .grant(consts.accessLevels.read)
          .next()

  hasPermission = testPropertyPermission(originalPrincipal, principal, publicUser.c_site._id, publicUser.c_study._id, statusPermission)

  return hasPermission
}

function publicUserSetStatusPermission(originalPrincipal, principal, publicUserContext, updateInfo) {
  let hasPermission = true

  if (runnerIsAdmin()) { return hasPermission }

  const statusPermission = PublicUserStatusPermission[updateInfo.c_status],
        publicUser = org.objects.c_public_users.find({ _id: publicUserContext._id })
          .skipAcl()
          .grant(consts.accessLevels.read)
          .next()

  hasPermission = testPropertyPermission(originalPrincipal, principal, publicUser.c_site._id, publicUser.c_study._id, statusPermission)

  return hasPermission
}

function taskResponseSetStatusPermission(originalPrincipal, principal, taskResposnesContext, updateInfo) {
  let hasPermission = true

  if (runnerIsAdmin()) { return hasPermission }

  const statusPermission = TaskResponseStatusPermission[updateInfo.c_status],
        taskResp = org.objects.c_task_responses.find({ _id: taskResposnesContext._id })
          .skipAcl()
          .grant(consts.accessLevels.read)
          .next()

  hasPermission = testPropertyPermission(originalPrincipal, principal, taskResp.c_site._id, taskResp.c_study._id, statusPermission)

  return hasPermission
}

function isNewSiteUser(accountRoles) {
  const allowedSiteRoleIds = NewSiteAccountRoles.map(v => consts.roles[v].toString())
  return accountRoles.some(v => allowedSiteRoleIds.includes(v.toString()))
}

class AclManagment {

  @acl('role', [consts.roles.Administrator])
  static isAdmin() {
    return true
  }

  @acl('role', [consts.roles['Data Reviewer']])
  static isDataReviewer() {
    return true
  }

  @acl('assert', caller => responseWritePermission(script.principal, script.context))
  static canCreateResponses() {
    return true
  }

  @acl('assert', caller => taskResponseEditPermission(script.principal, script.context))
  static canEditTaskResponse() {
    return true
  }

  @acl('assert', caller => stepResponseEditPermission(script.originalPrincipal, script.context))
  static canEditStepResponses() {
    return true
  }

  @acl('assert', caller => stepResponseCreatePermission(script.originalPrincipal, script.context))
  static canCreateStepResponses() {
    return true
  }

  @acl('assert', caller => publicUserSetReviewStatusPermission(script.originalPrincipal, script.principal, script.context, script.arguments.new))
  static canSetPublicUserReviewStatus() {
    return true
  }

  @acl('assert', caller => publicUserSetStatusPermission(script.originalPrincipal, script.principal, script.context, script.arguments.new))
  static canSetPublicUserStatus() {
    return true
  }

  @acl('assert', caller => taskResponseSetStatusPermission(script.originalPrincipal, script.principal, script.context, script.arguments.new))
  static canSetTaskResponseStatus() {
    return true
  }

  @acl('assert', caller => publicUserCreatePermission(script.principal, script.context))
  static canCreatePublicUser() {
    return true
  }

  @acl('account', SystemUser.email)
  static isSystemAccount() {
    return true
  }

}

module.exports = {
  AclManagment,
  SystemUser,
  runnerIsAdmin,
  getUserRoles(accountId, siteId, studyId) {
    const allowedSiteRoleIds = NewSiteAccountRoles.map(v => consts.roles[v].toString())
    const { accounts, c_site_users, c_studies, c_study_team_user } = org.objects

    const account = accounts.find({ _id: accountId })
            .skipAcl()
            .grant(consts.accessLevels.read)
            .expand('c_site_access_list')
            .next(),

          userRoles = {
            c_account: account._id,
            c_site: siteId,
            c_study: studyId,
            c_accountRoles: account.roles,
            c_siteRoles: [],
            c_studyRoles: []
          },
          siteAccessList = (account.c_site_access_list && account.c_site_access_list.map(v => v.toString())) || []

    userRoles.c_siteRoles = c_site_users.find({ c_site: siteId, c_account: accountId })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .map(item => consts.roles[item.c_role])
    userRoles.c_studyRoles = c_study_team_user.find({ c_study: studyId, c_account: accountId })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .map(item => consts.roles[item.c_role])

    // filter site roles from account roles if they dont have access to that site
    userRoles.c_accountRoles = userRoles.c_accountRoles.filter(v => {
      if (allowedSiteRoleIds.includes(v.toString()) && !(siteAccessList.includes(siteId.toString()))) {
        return false
      }
      return true
    })

    return userRoles
  },
  getUserRolesSimple(accountId, siteId, studyId) {
    const allowedSiteRoleIds = NewSiteAccountRoles.map(v => consts.roles[v].toString())
    const { accounts, c_site_users, c_studies, c_study_team_user } = org.objects

    const account = accounts.find({ _id: accountId })
            .skipAcl()
            .grant(consts.accessLevels.read)
            .expand('c_site_access_list')
            .next(),

          accountRoles = account.roles,
          siteRoles = c_site_users.find({ c_site: siteId, c_account: accountId })
            .skipAcl()
            .grant(consts.accessLevels.read)
            .map(item => consts.roles[item.c_role]),
          studyRoles = c_study_team_user.find({ c_study: studyId, c_account: accountId })
            .skipAcl()
            .grant(consts.accessLevels.read)
            .map(item => consts.roles[item.c_role]),
          siteAccessList = (account.c_site_access_list && account.c_site_access_list.map(v => v.toString())) || []
    // filter site role from account roles if they dont have access to that site
    const filteredAccountRoles = accountRoles.filter(v => {
      if (allowedSiteRoleIds.includes(v.toString()) && !(siteAccessList.includes(siteId.toString()))) {
        return false
      }
      return true
    })

    return [...new Set([...filteredAccountRoles, ...siteRoles, ...studyRoles])]
  },
  isNewSiteUser,
  isSystemUserID,
  isSiteUser() {
    let siteUser = false
    if (!isNewSiteUser(script.principal.roles)) {
      const siteIds = org.objects.c_sites.find()
        .paths('_id')
        .map(site => site._id)

      siteUser = org.objects.c_site_users
        .readOne({
          c_account: script.principal._id,
          c_site: { $in: siteIds }
        })
        .paths('_id')
        .skipAcl()
        .grant(consts.accessLevels.read)
        .throwNotFound(false)
        .execute() // will throw if no match found.
    } else {
      const { c_site_access_list: siteAccessList } = org.objects.accounts.find({ _id: script.principal._id })
        .paths('c_site_access_list')
        .next()
      siteUser = siteAccessList.length
    }
    return !!siteUser
  }
}