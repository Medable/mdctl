import _ from 'lodash'
import { id } from 'util'
import moment from 'moment.timezone'
import logger from 'logger'
import {
  log,
  on
} from 'decorators'
const config = require('config')

const OldSiteRoles = ['Site User', 'Site Monitor', 'Site Investigator'].filter(role => consts.roles[role])
        .map(role => consts.roles[role].toString()),
      NewSiteRoles = ['Axon Site User', 'Axon Site Monitor', 'Axon Site Investigator'].filter(role => consts.roles[role])
        .map(role => consts.roles[role].toString()),
      ExtraSiteRolesInOldAxon = [],
      AccountRolesAssignableToSiteUsers = ['Study Manager App', 'EC Document Manager'].filter(role => consts.roles[role])
        .map(role => consts.roles[role].toString()),
      SharedRoles = ['Study Manager App'].filter(role => consts.roles[role])
        .map(role => consts.roles[role].toString()),
      EconsentSiteRoles = ['EC Document Manager'].filter(role => consts.roles[role])
        .map(role => consts.roles[role].toString()),
      RoleConfig = config.get('usm__role_config') || {},
      ExcludeRoleToAssign = ['provider', 'tm__read_jobs', 'tm__create_jobs', 'c_study_participant'].filter(role => consts.roles[role])
        .map(role => consts.roles[role].toString())

export class UtilsLibrary {

  static isNewPermissionModel() {
    const study = org.objects.c_study.find()
      .skipAcl()
      .grant('read')
      .toArray()
    return study && study.length ? study[0].c_new_site_permission_model : false
  }

  static escapeRegex(s) {
    return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
  }

  static isEmail(str) {
    const regex = /^(?:[\w\!\#\$\%\&\'\*\+\-\/\=\?\^\`\{\|\}\~]+\.)*[\w\!\#\$\%\&\'\*\+\-\/\=\?\^\`\{\|\}\~]+@(?:(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-](?!\.)){0,61}[a-zA-Z0-9]?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9\-](?!$)){0,61}[a-zA-Z0-9]?)|(?:\[(?:(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\.){3}(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\]))$/ // eslint-disable-line no-useless-escape
    return _.isString(str) && str.length >= 3 && !!str.match(regex)
  }

  @log({ traceError: true })
  @on('usm__create_site_user', { name: 'usm__create_site_user' })
  static createSiteUser({ sitesToAssign, accountId, roles, OrgRoleMap }) {
    const siteUsers = []
    if (sitesToAssign && sitesToAssign.length) {
      const existingSiteUsers = org.objects.c_site_users.find({ c_account: accountId, c_site: { $in: sitesToAssign }, c_role: { $in: roles.map(role => OrgRoleMap[role]) } })
        .skipAcl()
        .grant('read')
        .paths('c_role', 'c_site._id')
        .toArray()
      for (const site of sitesToAssign) {
        for (const role of roles) {
          if (!existingSiteUsers.find(siteUser => siteUser.c_role === OrgRoleMap[role] && siteUser.c_site._id.toString() === site)) {
            siteUsers.push({ c_account: accountId, c_site: site, c_role: OrgRoleMap[role] })
          }
        }
      }
      for (const siteUserBatch of _.chunk(siteUsers, 100)) {
        org.objects
          .c_site_users
          .insertMany(siteUserBatch)
          .bypassCreateAcl()
          .grant('script')
          .execute()
      }
    }
  }

  @log({ traceError: true })
  @on('usm__delete_site_user', { name: 'usm__delete_site_user' })
  static deleteSiteUser({ c_account, c_role, c_site }) {
    org.objects.c_site_users.deleteMany({ c_account: c_account, c_role: c_role, c_site: c_site })
      .skipAcl()
      .grant('delete')
      .execute()
  }

  @log({ traceError: true })
  @on('usm__delete_all_site_user', { name: 'usm__delete_all_site_user' })
  static deleteAllSiteUser({ c_account, accountUpdateAttributes }) {
    const totalSiteUsers = org.objects.c_site_users.find({ c_account: c_account })
      .skipAcl()
      .grant('read')
      .count()
    if (totalSiteUsers <= 50) {
      org.objects.c_site_users.deleteMany({ c_account: c_account })
        .skipAcl()
        .grant('delete')
        .execute()
      return org.objects.account.updateOne({ _id: c_account }, { $set: { ...accountUpdateAttributes } })
        .skipAcl()
        .grant('script')
        .execute()
    } else {
      org.objects.c_site_users.deleteMany({ c_account: c_account })
        .skipAcl()
        .grant('delete')
        .limit(50)
        .execute()
      const cortexEvent = {
        type: 'script',
        event: 'usm__delete_all_site_user',
        principal: script.principal,
        key: `usm__delete_all_site_user-${Math.random()
          .toString(36)
          .substring(7)}`,
        param: { c_account: c_account }
      }
      org.objects.Events.insertOne(cortexEvent)
        .bypassCreateAcl()
        .grant(consts.accessLevels.update)
        .execute()
    }
  }

}

function getSiteRoles() {
  let customSiteRoles = _.get(RoleConfig.customRoles, 'customSiteRoles', []) || []
  customSiteRoles = customSiteRoles.filter(role => consts.roles[role])
    .map(role => consts.roles[role].toString())
  if (UtilsLibrary.isNewPermissionModel()) {
    return NewSiteRoles
  } else {
    if (RoleConfig.dmRolesSiteLevel) {
      return OldSiteRoles.concat(...ExtraSiteRolesInOldAxon)
        .concat(customSiteRoles)
    } else {
      return OldSiteRoles.concat(customSiteRoles)
    }
  }
}

function getRoleToNameMapping() {
  const OrgRoles = org.read('roles', { grant: 'read' })

  const RolesMap = {}
  OrgRoles
    .forEach(role => {
      RolesMap[role._id] = role.name
    })

  return RolesMap
}

function checkAdminUser() {
  return id.inIdArray(script.principal.roles, consts.roles.Administrator)
}

function isUserAndSiteManager() {
  return id.inIdArray(script.principal.roles, consts.roles.usm__user_and_site_manager)
}

function isSupportUser() {
  return id.inIdArray(script.principal.roles, consts.roles.support)
}

function sanitizeUrlParams(search) {
  try {
    return decodeURIComponent(search)
  } catch (e) {
    return search
  }
}

function getRoleNames(roles) {
  const orgRoleMap = getRoleToNameMapping()
  return roles.map(role => orgRoleMap[role])
}

function getRolesWithAllSiteAccess() {
  const cSiteSchema = org.objects.objects.find({ name: 'c_site' })
    .paths('defaultAcl')
    .skipAcl()
    .grant('read')
    .toArray()
  return cSiteSchema[0].defaultAcl.map(role => role.target && role.target.toString())
    .filter(Boolean)
}

function getRoleIdsFromRoleNames(roles) {
  if (roles && roles.length) {
    return roles.map(role => consts.roles[role] && consts.roles[role].toString())
      .filter(Boolean)
  }
  return []
}

function convertToLoggedInUserTz(time) {
  const account = org.objects.account.readOne({ _id: script.principal._id })
    .throwNotFound(false)
    .paths('tz')
    .skipAcl()
    .grant('read')
    .execute()
  const timeZone = account && account.tz ? account.tz : 'UTC'
  return moment.tz(time, timeZone)
    .format('MM/DD/YYYY hh:mm A z')
}

function manageSitesInNewPermissionModel({ accountId, sitesToAssign, sitesToUnassign }) {
  const { SitesAccessManagerLibrary } = require('usm__sites_access_manager_lib')
  if (sitesToUnassign && sitesToUnassign.length) {
    SitesAccessManagerLibrary.unassignSites(accountId, sitesToUnassign)
  }
  if (sitesToAssign && sitesToAssign.length) {
    SitesAccessManagerLibrary.assignSites(accountId, sitesToAssign)
  }
}

function manageSitesInOldPermissionModel({ accountId, sitesToAssign, sitesToUnassign, roles, rolesToUnassign }) {
  const OrgRoleMap = getRoleToNameMapping()
  const siteUsers = []

  if (rolesToUnassign && rolesToUnassign.length) {
    org.objects.c_site_users.deleteMany({ c_account: accountId, c_role: { $in: rolesToUnassign.map(roleId => OrgRoleMap[roleId]) } })
      .skipAcl()
      .grant('delete')
      .execute()
  }

  if (sitesToUnassign && sitesToUnassign.length) {
    if (!roles.length) {
      org.objects.c_site_users.deleteMany({ c_account: accountId, c_site: { $in: sitesToUnassign } })
        .skipAcl()
        .grant('delete')
        .execute()
    }
    for (const site of sitesToUnassign) {
      for (const role of roles) {
        org.objects.c_site_users.deleteMany({ c_account: accountId, c_site: site, c_role: OrgRoleMap[role] })
          .skipAcl()
          .grant('delete')
          .execute()
      }
    }

  }
  if (sitesToAssign && sitesToAssign.length) {
    const existingSiteUsers = org.objects.c_site_users.find({ c_account: accountId, c_site: { $in: sitesToAssign }, c_role: { $in: roles.map(role => OrgRoleMap[role]) } })
      .skipAcl()
      .grant('read')
      .paths('c_role', 'c_site._id')
      .toArray()
    for (const site of sitesToAssign) {
      for (const role of roles) {
        if (!existingSiteUsers.find(siteUser => siteUser.c_role === OrgRoleMap[role] && siteUser.c_site._id.toString() === site)) {
          siteUsers.push({ c_account: accountId, c_site: site, c_role: OrgRoleMap[role] })
        }
      }
    }
    /*
    We try to insert only 100 at a time because 100 is the default limit for max inserts in one call
  */
    for (const siteUserBatch of _.chunk(siteUsers, 100)) {
      org.objects
        .c_site_users
        .insertMany(siteUserBatch)
        .bypassCreateAcl()
        .grant('script')
        .execute()
    }

  }

}

function manageSitesInOldPermissionModelSingleUser({ accountId, sitesToAssign, sitesToUnassign, roles, accountUpdateAttributes }) {
  const OrgRoleMap = getRoleToNameMapping()
  if (!roles.length) {
    return UtilsLibrary.deleteAllSiteUser({ c_account: accountId, accountUpdateAttributes: accountUpdateAttributes })
  }

  if (sitesToUnassign.length > 50) {
    for (const siteIds of _.chunk(sitesToUnassign, 50)) {
      const cortexEvent = {
        type: 'script',
        event: 'usm__delete_site_user',
        principal: script.principal,
        key: `usm__delete_site_user-${Math.random()
          .toString(36)
          .substring(7)}`,
        param: { c_account: accountId, c_role: { $in: roles.map(roleId => OrgRoleMap[roleId]) }, c_site: { $in: siteIds } }
      }
      org.objects.Events.insertOne(cortexEvent)
        .bypassCreateAcl()
        .grant(consts.accessLevels.update)
        .execute()
    }
  } else {
    UtilsLibrary.deleteSiteUser({ c_account: accountId, c_role: { $in: roles.map(roleId => OrgRoleMap[roleId]) }, c_site: { $in: sitesToUnassign } })
  }

  if (sitesToAssign.length > 50) {
    for (const siteIds of _.chunk(sitesToAssign, 250)) {
      const cortexEvent = {
        type: 'script',
        event: 'usm__create_site_user',
        principal: script.principal,
        key: `usm__create_site_user-${Math.random()
          .toString(36)
          .substring(7)}`,
        param: {
          sitesToAssign: siteIds,
          accountId,
          roles,
          OrgRoleMap
        }
      }
      org.objects.Events.insertOne(cortexEvent)
        .bypassCreateAcl()
        .grant(consts.accessLevels.update)
        .execute()
    }

  } else {
    UtilsLibrary.createSiteUser({ sitesToAssign, accountId, roles, OrgRoleMap })
  }

}

function segregateSiteAndAccountLevelRoles(roles, sites, allSiteRoles) {
  roles = roles || []
  const isNewPermissionModel = UtilsLibrary.isNewPermissionModel()
  const userSiteRoles = [],
        userAccountRoles = []
  if (!sites) {
    userAccountRoles.push(...roles)
  } else {
    for (const role of roles) {
      if (!isNewPermissionModel && allSiteRoles.includes(role)) {
        userSiteRoles.push(role)
      } else {
        userAccountRoles.push(role)
      }
    }
  }

  return { userSiteRoles, userAccountRoles }
}

function provisionAccount({ username, email, roles, name, tz, mobile, loginMethods }) {
  return script.as(checkAdminUser() ? script.principal : 'c_system_user', { principal: { grant: consts.accessLevels.script, skipAcl: true } }, () => {
    let provisioningParams = _.omitBy({ username, email, roles, tz, mobile, loginMethods }, _.isNil)
    if (!isLoginMethodsUpdateAllowed()) {
      provisioningParams = _.omit(provisioningParams, ['loginMethods'])
    }
    if (name && (name.first || name.last)) {
      provisioningParams.name = _.omitBy(name, _.isNil)
    }
    return org.objects.account.provision(provisioningParams)
  }
  )
}

function skipValidation() {
  return RoleConfig.skipValidation
}

function getOrgSitesCount() {
  return org.objects.c_sites.find()
    .skipAcl()
    .grant('read')
    .count()
}

function isLoginMethodsUpdateAllowed() {
  const { configuration: { ssoEnabled, loginMethods } } = org.read({ grant: 'read', paths: 'configuration' })

  return ssoEnabled && loginMethods && loginMethods.length > 0
}

function isUserNameRequired() {
  const accounts = org.read('configuration.accounts', { grant: 'read' })

  return !!(accounts && accounts.requireUsername)
}

function isSiteUserRoles(roles) {
  const allSiteRoles = OldSiteRoles.concat(NewSiteRoles)
    .concat(EconsentSiteRoles)
  roles = roles.map(role => role.toString())
  return !!allSiteRoles.filter(role => roles.includes(role)).length

}

module.exports = {
  UtilsLibrary,
  getSiteRoles,
  AccountRolesAssignableToSiteUsers,
  OldSiteRoles,
  NewSiteRoles,
  SharedRoles,
  EconsentSiteRoles,
  getRoleToNameMapping,
  checkAdminUser,
  sanitizeUrlParams,
  getRoleNames,
  getRolesWithAllSiteAccess,
  getRoleIdsFromRoleNames,
  convertToLoggedInUserTz,
  manageSitesInNewPermissionModel,
  manageSitesInOldPermissionModel,
  segregateSiteAndAccountLevelRoles,
  provisionAccount,
  ExcludeRoleToAssign,
  RoleConfig,
  skipValidation,
  getOrgSitesCount,
  LoginMethodsUpdateAllowed: isLoginMethodsUpdateAllowed(),
  UserNameRequired: isUserNameRequired(),
  isSiteUserRoles,
  manageSitesInOldPermissionModelSingleUser,
  isUserAndSiteManager,
  isSupportUser
}