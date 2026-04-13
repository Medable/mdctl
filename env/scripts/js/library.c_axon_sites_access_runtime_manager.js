/***********************************************************

 @script     Axon - site access management Routes Library

 @brief      Desc

 @author     Saurav Singh

 (c)2021 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import { SitesAccessManagerLibrary, OldSiteAccessManagerLibrary } from 'c_axon_sites_access_manager_lib'
import connections from 'connections'
import { roles } from 'consts'
import faults from 'c_fault_lib'
import cache from 'cache'
const { route, log, trigger, as } = require('decorators')
const { array: toArray } = require('util.values')

class SitesAccessManagerRuntimes {

  /**
   * @openapi
   * /accounts/{account}/sites/assign:
   *  post:
   *    description: 'assign site'
   *    parameters:
   *      - name: account
   *        in: path
   *    requestBody:
   *      description: list of sites
   *
   *    responses:
   *      '200':
   *        description: always returns true
   */
  @log({ traceResult: true, traceError: true })
  @route({
    weight: 1,
    method: 'POST',
    name: 'c_axon_assign_site',
    path: 'accounts/:account/sites/assign',
    acl: ['role.administrator', 'role.support']
  })
  static assignSites({ req: { params: { account } }, body }) {
    return SitesAccessManagerLibrary.assignSites(account, toArray(body()))
  }

  /**
   * @openapi
   * /accounts/{account}/sites/unassign:
   *  post:
   *    description: 'unassign site'
   *    parameters:
   *      - name: account
   *        in: path
   *    requestBody:
   *      description: list of sites
   *
   *    responses:
   *      '200':
   *        description: always returns true
   */
  @log({ traceResult: true, traceError: true })
  @route({
    weight: 1,
    method: 'POST',
    name: 'c_axon_unassign_site',
    path: 'accounts/:account/sites/unassign',
    acl: ['role.administrator', 'role.support']
  })
  static unassignSites({ req: { params: { account } }, body }) {
    return SitesAccessManagerLibrary.unassignSites(account, toArray(body()))
  }

  @log({ traceError: true })
  @trigger('create.before', 'update.before', { object: 'c_site_user', name: 'c_check_site_user_role', weight: 1, principal: 'c_system_user' })
  @as('c_system_user', { principal: { skipAcl: true, grant: consts.accessLevels.read }, modules: { safe: false } })
  static createBeforeSiteUser({ new: newSiteUser, old: oldStudyUser, event }) {
    const isDevelopment = script.env.name === 'development'
    const invalidRoleCheckDisabled = isDevelopment ? cache.get('direct_role_assignment_check_disabled') : false
    const siteUser = newSiteUser
    if (invalidRoleCheckDisabled) {
      return true
    }
    OldSiteAccessManagerLibrary.checkStudyPermissionsModel()
    OldSiteAccessManagerLibrary.checkIfValidSiteLevelRole(siteUser)
    OldSiteAccessManagerLibrary.checkIfHasAccountRole(siteUser)

    return true
  }

  @log({ traceError: true })
  @trigger('update.before', { object: 'c_site_user', name: 'c_update_check_site_user_role', weight: 1, principal: 'c_system_user' })
  @as('c_system_user', { principal: { skipAcl: true, grant: consts.accessLevels.read }, modules: { safe: false } })
  static updateBeforeSiteUser({ new: newSiteUser, old: oldStudyUser, event }) {
    const isDevelopment = script.env.name === 'development'
    const invalidRoleCheckDisabled = isDevelopment ? cache.get('direct_role_assignment_check_disabled') : false
    const siteUser = { ...oldStudyUser, ...newSiteUser }
    if (invalidRoleCheckDisabled) {
      return true
    }
    OldSiteAccessManagerLibrary.checkStudyPermissionsModel()
    OldSiteAccessManagerLibrary.checkIfValidSiteLevelRole(siteUser)
    OldSiteAccessManagerLibrary.checkIfHasAccountRole(siteUser)

    return true
  }

}

module.exports = SitesAccessManagerRuntimes