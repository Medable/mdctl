import _ from 'lodash'
import { route } from 'decorators'
import { checkAdminUser, isUserAndSiteManager, isSupportUser, getSiteRoles, AccountRolesAssignableToSiteUsers, NewSiteRoles, OldSiteRoles, EconsentSiteRoles, SharedRoles, ExcludeRoleToAssign, RoleConfig } from 'usm__utils_lib'
import { RoleIdsNotAccessibleToSupportUser, RoleIdsNotAccessibleToUSMUser } from 'usm__consts'

const RolesMap = {},
      OrgRoles = org.read('roles', { grant: 'read' })

OrgRoles
  .forEach(role => {
    RolesMap[role._id] = role
  })

export class RolesLibrary {

  @route({
    method: 'GET',
    name: 'usm__org_roles',
    path: 'usm/org_roles',
    acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
  })
  static getRoles() {
    let customSharedRoles = _.get(RoleConfig.customRoles, 'customSharedRoles', []) || []
    let customSiteRoles = _.get(RoleConfig.customRoles, 'customSiteRoles', []) || []
    customSharedRoles = customSharedRoles.filter(role => consts.roles[role])
      .map(role => consts.roles[role].toString())
    customSiteRoles = customSiteRoles.filter(role => consts.roles[role])
      .map(role => consts.roles[role].toString())

    const allowedSiteRoles = getSiteRoles()
            .concat(EconsentSiteRoles)
            .concat(customSiteRoles),
          isCurrentUserAdmin = checkAdminUser(),
          isCurrentUserUserAndSiteManager = isUserAndSiteManager(),
          isCurrentUserSupport = isSupportUser(),
          siteOnlyRoles = new Set(
            NewSiteRoles
              .concat(OldSiteRoles)
              .concat(EconsentSiteRoles)
          )
    let allowedAccountRoles = [],
        sharedRoles = SharedRoles.concat(customSharedRoles)

    for (const roleId in RolesMap) {
      if (SharedRoles.includes(roleId) || ExcludeRoleToAssign.includes(roleId)) {
        continue
      }
      if (!siteOnlyRoles.has(roleId)) {
        if (isCurrentUserAdmin) {
          allowedAccountRoles.push(roleId)
        } else if (isCurrentUserUserAndSiteManager && !RoleIdsNotAccessibleToUSMUser.includes(roleId)) {
          allowedAccountRoles.push(roleId)
        } else if (isCurrentUserSupport && !RoleIdsNotAccessibleToSupportUser.includes(roleId)) {
          allowedAccountRoles.push(roleId)
        }
      }
    }
    if (RoleConfig.skipValidation) {
      sharedRoles = [...allowedAccountRoles, ...sharedRoles]
      allowedAccountRoles = []
    }
    return {
      accountRoles: allowedAccountRoles
        .map(role => RolesMap[role]),
      siteRoles: allowedSiteRoles
        .map(role => RolesMap[role]),
      sharedRoles: sharedRoles
        .map(role => RolesMap[role])
    }
  }

  @route({
    method: 'GET',
    name: 'usm__org_update_roles',
    path: 'usm/org_update_roles',
    acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
  })
  static getUpdateRoles() {
    let customSharedRoles = _.get(RoleConfig.customRoles, 'customSharedRoles', []) || []
    let customSiteRoles = _.get(RoleConfig.customRoles, 'customSiteRoles', []) || []
    customSharedRoles = customSharedRoles.filter(role => consts.roles[role])
      .map(role => consts.roles[role].toString())
    customSiteRoles = customSiteRoles.filter(role => consts.roles[role])
      .map(role => consts.roles[role].toString())

    const allowedSiteRoles = getSiteRoles()
            .concat(EconsentSiteRoles)
            .concat(customSiteRoles),
          isCurrentUserAdmin = checkAdminUser(),
          siteOnlyRoles = new Set(
            NewSiteRoles
              .concat(OldSiteRoles)
              .concat(EconsentSiteRoles)
          )
    let allowedAccountRoles = [],
        sharedRoles = SharedRoles.concat(customSharedRoles)
    const allowAllRoles = true
    for (const roleId in RolesMap) {
      if (SharedRoles.includes(roleId) || ExcludeRoleToAssign.includes(roleId)) {
        continue
      }
      if (!siteOnlyRoles.has(roleId)) {
        if (isCurrentUserAdmin) {
          allowedAccountRoles.push(roleId)
        } else if (allowAllRoles) {
          allowedAccountRoles.push(roleId)
        }
      }
    }
    if (RoleConfig.skipValidation) {
      sharedRoles = [...allowedAccountRoles, ...sharedRoles]
      allowedAccountRoles = []
    }
    return {
      accountRoles: allowedAccountRoles
        .map(role => RolesMap[role]),
      siteRoles: allowedSiteRoles
        .map(role => RolesMap[role]),
      sharedRoles: sharedRoles
        .map(role => RolesMap[role])
    }
  }

}