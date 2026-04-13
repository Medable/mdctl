/***********************************************************

 @script     USM - Site Access Management Library

 @brief      Desc

 @author     Saurav Singh

 (c)2021 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import { acl } from 'decorators'
import faults from 'c_fault_lib'
import { id } from 'util'
import cache from 'cache'

const {
  accounts,
  c_sites
} = org.objects

const ALLOWED_NEW_SITE_ROLES = ['Axon Site Investigator',
  'Axon Site User',
  'Axon Site Monitor',
  'EC Document Manager',
  'Study Manager App'
].map(role => consts.roles[role] && consts.roles[role].toString())
  .filter(Boolean)

class SitesAccessManagerLibrary {

  @acl('role', ['administrator', 'support', 'usm__user_and_site_manager'])
  static assignSites(accId, sites) {
    return script.as(script.principal._id, { safe: false, principal: { skipAcl: true, grant: 'script' } }, () => {
      const account = accounts.readOne({ _id: accId })
        .paths('c_site_access_list', 'roles')
        .throwNotFound(false)
        .skipAcl()
        .grant(consts.accessLevels.read)
        .execute()

      if (!account) {
        faults.throw('axon.invalidArgument.invalidAccountNotFound')
      }

      if (!account.roles.length) {
        faults.throw('axon.invalidArgument.invalidSiteAssignRole')
      }

      const isDevelopment = script.env.name === 'development'
      const invalidRoleCheckDisabled = isDevelopment ? cache.get('direct_role_assignment_check_disabled') : false

      const invalidRoles = account.roles.filter(role => !ALLOWED_NEW_SITE_ROLES.includes(role.toString()))

      if (invalidRoles.length && !invalidRoleCheckDisabled) {
        faults.throw('axon.invalidArgument.invalidSiteAssignRole')
      }

      const sitesUpdate = new Set(account.c_site_access_list || [])
      // validate all the sites
      sites.forEach(v => {
        c_sites.find({ _id: v })
          .paths('_id')
          .next()

        sitesUpdate.add(v)
      })

      accounts.updateOne({ _id: accId }, { $set: { c_site_access_list: [...sitesUpdate] } })
        .execute()

      return true
    })
  }

  @acl('role', ['administrator', 'support', 'usm__user_and_site_manager'])
  static unassignSites(accId, sites) {
    return script.as(script.principal._id, { safe: false, principal: { skipAcl: true, grant: 'script' } }, () => {
      const account = accounts.readOne({ _id: accId })
        .paths('c_site_access_list')
        .execute()

      const c_site_access_list = (account.c_site_access_list || []).filter(v => !sites.includes(v.toString()))

      accounts.updateOne({ _id: accId }, { $set: { c_site_access_list } })
        .execute()

      return true
    })
  }

}

class OldSiteAccessManagerLibrary {

  static allowedSiteUserRoles = [
    'Site User',
    'Site Monitor',
    'Site Investigator'
  ]

  static allowedAccountLevelRoles = [
    'Study Manager App',
    'EC Document Manager',
    'Axon Site User',
    'Axon Site Monitor',
    'Axon Site Investigator'
  ]

  @acl('role', ['administrator', 'support', 'usm__user_and_site_manager'])
  static checkStudyPermissionsModel() {
    const studyCursor = org.objects
      .c_study
      .find()
      .paths('c_new_site_permission_model')

    if (!studyCursor.hasNext()) throw Fault.create('kInvalidArgument')

    const study = studyCursor.next()

    if (study.c_new_site_permission_model) {
      throw Fault.create('kInvalidArgument')
    }
  }

  @acl('role', ['administrator', 'support', 'usm__user_and_site_manager'])
  static checkIfValidSiteLevelRole(newSiteUser) {

    const isSiteLevelRole = this.allowedSiteUserRoles.includes(newSiteUser.c_role)

    if (!isSiteLevelRole) {
      faults.throw('axon.invalidArgument.invalidSiteAssignRole')
    }
  }

  static checkForInvalidAccountRoles(account) {

    if (!account.roles || account.roles.length === 0) return true

    const roleIds = this
      .allowedSiteUserRoles
      .map(roleName => consts.roles[roleName])
      .filter(roleId => !!roleId)
      .map(roleId => roleId.toString())

    const hasSiteRole = account
      .roles
      .find(role =>
        roleIds.includes(role.toString())
      )

    if (hasSiteRole) {
      faults.throw('axon.invalidArgument.noDirectAssignmentOfSiteRole')
    }
  }

  static checkIfHasSiteUserRole(account) {

    if (!account.roles || !account.roles.length) return true

    const allowedAccountLevelRoleIds = Object
      .keys(consts.roles)
      .filter(roleName => this.allowedAccountLevelRoles.includes(roleName))
      .map(roleName => consts.roles[roleName])

    let hasInvalidAccountRole = false
    if (account && account.roles && account.roles.find(roleId => !id.inIdArray(allowedAccountLevelRoleIds, roleId))) {
      hasInvalidAccountRole = true
    }

    const isSiteUser = org.objects
      .c_site_users
      .find({ c_account: account._id })
      .skipAcl()
      .grant('read')
      .hasNext()

    if (isSiteUser && hasInvalidAccountRole) {
      faults.throw('axon.invalidArgument.noDirectAssignmentOfAccountRoleWithNewSiteRole')
    }
  }

  static checkIfHasAccountRole(newSiteUser) {

    const allowedAccountLevelRoleIds = Object
      .keys(consts.roles)
      .filter(roleName => this.allowedAccountLevelRoles.includes(roleName))
      .map(roleName => consts.roles[roleName])

    const accountLevelRoles = org.objects.accounts
      .find({ _id: newSiteUser.c_account._id })
      .skipAcl()
      .grant('read')
      .paths('roles')
      .next()
      .roles

    const hasAccountRole = accountLevelRoles.find(roleId => !id.inIdArray(allowedAccountLevelRoleIds, roleId))

    if (hasAccountRole) {
      faults.throw('axon.invalidArgument.noDirectAssignmentOfAccountRoleWithNewSiteRole')
    }
  }

}

module.exports = {
  SitesAccessManagerLibrary,
  OldSiteAccessManagerLibrary
}