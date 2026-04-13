import config from 'config'
import { route, log } from 'decorators'
import semver from 'semver'

const OrgRoleMap = getRoleIdToCodeMapping()
const AppsConfig = getAvailableAppsConfig()
const NewPermissionModel = isNewPermissionModel()
const SiteRoleCodesForNewPermissionModel = ['c_axon_site_user', 'c_axon_site_monitor', 'c_axon_site_investigator']
const CortexWebApp = { name: 'cortex_web_ui', label: 'Cortex Web UI' }
const DataTransfersApp = { name: 'data-transfers', label: 'Data Transfers' }
const { env: ScriptEnv, org: { code: OrgCode } } = script
export class AppsLister {

  @log({ traceError: true })
  @route({
    method: 'GET',
    name: 'ad__list_apps',
    path: 'ad/list_apps',
    acl: ['account.public']
  })
  static listAppsForUser() {
    const currentUser = org.objects.account.find({ _id: script.principal._id })
      .paths('roles', 'c_site_access_list')
      .passive()
      .next()
    const currentUserRoles = getRolesForCurrentUser(currentUser)
    const allowedApps = getAppsAllowedForUserRoles(currentUserRoles)
    const appsResponse = allowedApps.map(app =>
      formatAppConfig(app)
    )

    return { allowedApps: appsResponse, hasMultipleApps: allowedApps.length > 1 }
  }

}

function getAppsAllowedForUserRoles(currentUserRoles) {
  const deployedApps = getDeployedApps()
  const allowedApps = deployedApps.filter(app => {
    const appConfig = AppsConfig[app.name]
    if (typeof (appConfig) === 'object') {
      const userHasAllowedRoles = appConfig.allowedRoles.some(role => currentUserRoles.includes(role))
      const userHasAllMandatoryRoles = (appConfig.mandatoryRoles || []).every(role => currentUserRoles.includes(role))
      return userHasAllowedRoles && userHasAllMandatoryRoles
    } else {
      return false
    }
  })

  return allowedApps
}

function formatAppConfig(app) {
  const appConfig = AppsConfig[app.name]
  return { name: app.name, label: appConfig.displayName, icon: appConfig.icon, url: constructAppUrl(app.name, appConfig) }
}

function getRolesForCurrentUser({ roles, c_site_access_list }) {
  let currentUserRoles = roles.map(roleId => OrgRoleMap[roleId])
  // if new permission model but no site assigned, we remove all site roles
  if (NewPermissionModel && (c_site_access_list || []).length === 0) {
    currentUserRoles = currentUserRoles.filter(role => !SiteRoleCodesForNewPermissionModel.includes(role))
  // if old permission model and c_site_user exists, we consider those site roles
  } else if (!NewPermissionModel) {
    const siteRoles = getOldSiteRolesForCurrentUser()
    currentUserRoles.push(...siteRoles)
  }

  return currentUserRoles
}

function getOldSiteRolesForCurrentUser() {
  const RoleNameToCodeMapping = {
    'Site User': 'c_site_user',
    'Site Monitor': 'c_site_monitor',
    'Site Investigator': 'c_site_investigator'
  }

  const siteUserAggregation = org.objects.c_site_users.aggregate()
    .skipAcl()
    .grant('read')
    .match({ c_account: script.principal._id.toString() })
    .project({ c_role: 1 })
    .group({ _id: null, roles: { $addToSet: 'c_role' } })
    .toArray()

  if (siteUserAggregation.length === 0) {
    return []
  }
  const siteUserRoles = siteUserAggregation[0].roles

  return siteUserRoles.map(role => RoleNameToCodeMapping[role])
}

function isNewPermissionModel() {
  const study = org.objects.c_study.find()
    .skipAcl()
    .grant('read')
    .paths('c_new_site_permission_model')
    .passive()
    .toArray()
  return study && study.length ? study[0].c_new_site_permission_model : false
}

function getRoleIdToCodeMapping() {
  const OrgRoles = org.objects.org.find()
    .skipAcl()
    .grant('read')
    .paths('roles')
    .next()
    .roles

  const RolesMap = {}
  OrgRoles
    .forEach(role => {
      RolesMap[role._id] = role.code
    })

  return RolesMap
}

function getDeployedApps() {
  const deployedApps = org.objects.org
    .find()
    .skipAcl()
    .grant('read')
    .paths('apps')
    .next()
    .apps
    .map(({ name, label }) => ({ name, label }))

  // Cortex web ui is deployed by default
  deployedApps.push(CortexWebApp)

  const dataTransferAppDeployed = isDataTransferAppDeployed()
  if (dataTransferAppDeployed) {
    deployedApps.push(DataTransfersApp)
  }

  return deployedApps
}

function isDataTransferAppDeployed() {
  return !!config.get('dt__version')
}

function constructAppUrl(appName, { hostPrefix, urlPath, orgCodeAsUrlPath }) {
  // Assumption is All API endpoints follow api.<env>.medable.com (even api.int-dev.medable.com works )  (<env> could be blank for prod endpoint)
  // but most web apps (except Cortex web) follow the convention <app_name>-<env>.medable.com (<env> could be blank for prod endpoint)
  // so we first convert all urls from "api." to "api-", UNLESS its the prod endpoint api.medable.com/cn
  // and then replace the "api" part with the app host like builder, portal etc

  let host = ScriptEnv.host
  const urlParts = ScriptEnv.host.split('.')
  // url parts will be 4 in scenarios like api.<env>.medable.com
  // for Cortex web, use the same format as that of api endpoint
  if (appName !== 'cortex_web_ui' && urlParts.length === 4) {
    host = host.replace('api.', 'api-')
  }

  host = 'https://' + host.replace('api', hostPrefix)

  if (urlPath) {
    host = host + `/${urlPath}`
  }
  if (orgCodeAsUrlPath) {
    return `${host}/${OrgCode}`
  } else {
    return `${host}?orgCode=${OrgCode}`
  }
}

function getAvailableAppsConfig() {
  const allApps = config.get('ad__available_apps')
  const currentAxonVersion = config.get('axon__version').version
  // For Axon Version < 4.20, EC Document Manager role also has access to EConsent
  if (semver.lt(currentAxonVersion, '4.20.0')) {
    if (allApps.ec__econsent) {
      allApps.ec__econsent.allowedRoles.push('ec__document_manager')
    }
    if(allApps.c_site_app_demo) {
      allApps.c_site_app_demo.allowedRoles = allApps.c_site_app_demo.allowedRoles.filter(item => item !== 'ec__document_manager')
    }
  }
  return allApps
}