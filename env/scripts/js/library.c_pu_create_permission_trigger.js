import nucUtils from 'c_nucleus_utils'
import faults from 'c_fault_lib'
const { trigger } = require('decorators')

const NewSiteAccountRoleIds = [
  'Axon Site User',
  'Axon Site Monitor',
  'Axon Site Auditor',
  'Axon Site Investigator'
].map(role => consts.roles[role] && consts.roles[role].toString())

const RoleIdsAllowedToCreatePU = [
  'Administrator',
  'Site User',
  'Site Investigator',
  'Axon Site User',
  'Axon Site Investigator'
].map(role => consts.roles[role] && consts.roles[role].toString())

const OldRoleIdsAllowedToCreatePU = [
  'Site User',
  'Site Investigator'
].map(role => consts.roles[role] && consts.roles[role].toString())

export class PUCreatePermissionLibrary {

  @trigger('create.before', { object: 'c_public_user', name: 'c_pu_create_permission_trigger' })
  static validateCreatePermission({ new: { c_site } }) {
    let error = false
    if (c_site) {
      const currentUserRoleIds = this.getCurrentUserRoleId(c_site)
      error = !currentUserRoleIds.some(roleId => RoleIdsAllowedToCreatePU.includes(roleId.toString()))
    } else {
      error = !script.context.accessRoles.some(roleId => RoleIdsAllowedToCreatePU.includes(roleId.toString()))
      if (error) {
        error = !this.isCurrentUserSiteUser()
      }
    }
    if (error) {
      faults.throw('cortex.accessDenied.instanceCreate')
    }
  }

  static isCurrentUserSiteUser() {
    try {
      const siteRoleIds = org.objects.c_site_users.find({ c_account: script.principal._id })
        .skipAcl()
        .grant(consts.accessLevels.read)
        .map(item => consts.roles[item.c_role].toString())

      return OldRoleIdsAllowedToCreatePU.some(roleId => siteRoleIds.includes(roleId.toString()))
    } catch (e) {
      return false
    }
  }

  static getCurrentUserRoleId(site) {
    let accountLevelRoles = script.principal.roles
    let siteRoles = []
    if (site) {
      if (!nucUtils.isNewSiteUser(script.principal.roles)) {
        siteRoles = this.getOldSiteRoles(site)
      } else {
        accountLevelRoles = this.filterRolesIfSiteNotAssiged(site, accountLevelRoles)
      }
    }
    return [...accountLevelRoles, ...siteRoles]
  }

  static getOldSiteRoles(site) {
    return org.objects.c_site_users.find({ c_site: site._id, c_account: script.principal._id })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .map(item => consts.roles[item.c_role])
  }

  static filterRolesIfSiteNotAssiged(site, accountLevelRoles) {
    const sitesIds = org.objects.accounts.find({ _id: script.principal._id })
      .paths('c_site_access_list')
      .next()
      .c_site_access_list
      .map(siteId => siteId.toString())

    accountLevelRoles = accountLevelRoles.filter(v => {
      if (NewSiteAccountRoleIds.includes(v.toString()) && !sitesIds.includes(site._id.toString())) {
        return false
      }
      return true
    })
    return accountLevelRoles
  }

}