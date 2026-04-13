import _ from 'lodash'
import { route } from 'decorators'
import faults from 'c_fault_lib'
import { id } from 'util'
import { UtilsLibrary, getRoleNames, getRolesWithAllSiteAccess, getRoleIdsFromRoleNames, convertToLoggedInUserTz, getOrgSitesCount, isSiteUserRoles, LoginMethodsUpdateAllowed } from 'usm__utils_lib'
const isNewPermissionModel = UtilsLibrary.isNewPermissionModel()
const ROLES_WITH_ALL_SITE_ACCESS = getRolesWithAllSiteAccess()

function getSites(options) {
  const { roles, c_sites, siteUserSites, c_site_access_list = [] } = options
  const orgSitesCount = getOrgSitesCount()
  if (roles.some(role => ROLES_WITH_ALL_SITE_ACCESS.includes(role.toString()))) {
    return { siteNames: 'All Sites' }
  }
  return { siteNames: '' }
}

function getUserDetails(userId) {
  let sites, roleNames
  const [user] = script.as(script.principal._id, { principal: { skipAcl: true, grant: consts.accessLevels.update } }, () => {
    return org.objects.accounts.find({ _id: userId })
      .paths('name', 'email', 'username', 'roles', 'mobile', 'state', 'locked', 'created', 'updated', 'stats.lastLogin.time', 'stats.lastPasswordReset', 'tz', 'c_sites', 'c_site_access_list', 'loginMethods')
      .passive()
      .toArray()
  })
  if (!user) {
    faults.throw('usm.notFound.account')
  }
  if (id.inIdArray(user.roles, consts.roles.c_study_participant)) {
    throw Fault.create('kAccessDenied')
  }

  let { _id, name, email, username, roles, mobile, state, locked, created, updated, stats, tz, loginMethods } = user
  const mappedState = state === 'verified' ? 'active' : 'pending'

  if (isNewPermissionModel) {
    const { c_sites, c_site_access_list = [] } = user
    roleNames = getRoleNames(roles)
    sites = getSites({ roles })
  } else {
    const sitesData = script.as(script.principal._id, { principal: { skipAcl: true, grant: consts.accessLevels.read } }, () => {
      return org.objects.c_site_users.find({ 'c_account._id': userId })
        .paths('c_role')
        .toArray()
    })

    const siteUserRoles = _.uniq(sitesData.map(site => site.c_role))
    sites = getSites({ roles })
    roles = [...roles, ...getRoleIdsFromRoleNames(siteUserRoles)]
    roleNames = getRoleNames(roles)
  }

  if (LoginMethodsUpdateAllowed && (!loginMethods || !loginMethods.length)) {
    loginMethods = ['sso', 'credentials']
  }

  return {
    _id,
    name,
    email,
    username: username,
    mobile,
    state: locked ? 'locked' : mappedState,
    userCreationTime: convertToLoggedInUserTz(created),
    userLastUpdated: convertToLoggedInUserTz(updated),
    lastLoginTime: stats.lastLogin ? convertToLoggedInUserTz(stats.lastLogin.time) : '',
    lastPasswordResetTime: convertToLoggedInUserTz(stats.lastPasswordReset),
    userTimezone: tz,
    roles,
    sites: sites.siteNames,
    showSiteTable: isSiteUserRoles(roles),
    roleNames,
    loginMethods
  }
}

export class UserDetailsLibrary {

    @route({
      method: 'GET',
      name: 'usm__user_details',
      path: 'usm/users/:userId',
      acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
    })
  static getUser({ req }) {
    const { userId } = req.params
    return getUserDetails(userId)
  }

}