import _ from 'lodash'
import { route } from 'decorators'
import faults from 'c_fault_lib'
import { UtilsLibrary, sanitizeUrlParams, convertToLoggedInUserTz, EconsentSiteRoles } from 'usm__utils_lib'
import { updateSiteLocaleSingle, formatResponse } from 'usm__locale_utils_lib'
const isNewPermissionModel = UtilsLibrary.isNewPermissionModel()
const BULK_LOCALE_UPDATE_LIMIT = 100

function getSearchTerms(search) {
  if (search) {
    search = sanitizeUrlParams(search)
    const siteSchema = org.objects.object.find({ name: 'c_site' })
      .paths('properties.name')
      .skipAcl()
      .grant('read')
      .toArray()
    const hasCountry = siteSchema[0] && siteSchema[0].properties.length && siteSchema[0].properties.find(prop => prop.name === 'c_country')
    if (hasCountry) {
      return {
        $or: [
          { c_name: { $regex: `/.*${search}.*/i` } },
          { c_number: { $regex: `/.*${search}.*/i` } },
          { c_country: { $regex: `/.*${search}.*/i` } }
        ]
      }
    }
    return {
      $or: [
        { c_name: { $regex: `/.*${search}.*/i` } },
        { c_number: { $regex: `/.*${search}.*/i` } }
      ]
    }
  }
}

function getUserCounts(siteIds) {
  const match = { $match: { _id: { $in: siteIds } } }
  let project
  if (isNewPermissionModel) {
    project = {
      $project: {
        _id: 1,
        c_site_account_list: {
          $expand: {
            pipeline: [
              { $group: { _id: null, count: { $count: '_id' } } }
            ]
          }
        }
      }
    }
  } else {
    project = {
      $project: {
        _id: 1,
        c_site_users: {
          $expand: {
            pipeline: [
              { $group: { _id: null, count: { $count: '_id' } } }
            ]
          }
        }
      }
    }
  }
  const data = org.objects.c_sites.aggregate([match, project])
    .skipAcl()
    .grant('read')
    .toArray()

  return _.keyBy(data, '_id')
}

function addUserCountToSite(site, userCountsBySite) {
  const userCountBySite = userCountsBySite[site._id][`${isNewPermissionModel ? 'c_site_account_list' : 'c_site_users'}`].data
  site.userCount = userCountBySite.length ? userCountBySite[0].count : 0
  return site
}

function formatLocaleInfo(site) {
  const siteLocales = site.c_site_supported_locales
  const patientLocales = site.c_supported_locales
  if (siteLocales) {
    site.c_site_supported_locales = siteLocales.length === 1
      ? siteLocales[0]
      : siteLocales.length
  }
  if (patientLocales) {
    site.c_supported_locales = patientLocales.length === 1
      ? patientLocales[0]
      : patientLocales.length
  }
  return site
}

function formatSiteUpdatedAt(site) {
  site.updated = convertToLoggedInUserTz(site.updated)
  return site
}

function getSitesFromAccounts(userId, searchTerms, skip, limit, sort, pageNumber) {
  const sites = script.as(script.principal._id, { principal: { skipAcl: true, grant: consts.accessLevels.update } }, () => {
    return org.objects.accounts
      .find(searchTerms)
      .pathPrefix(`${userId}/c_sites`)
      .paths('_id', 'c_name', 'c_number', 'c_country', 'c_pi_name')
      .passive()
      .skip(skip)
      .limit(limit)
      .sort(sort)
      .toList()
  })

  const totalRecords = script.as(script.principal._id, { principal: { skipAcl: true, grant: consts.accessLevels.update } }, () => {
    return org.objects.accounts
      .find(searchTerms)
      .pathPrefix(`${userId}/c_sites`)
      .count()
  })

  sites.totalRecords = totalRecords
  sites.totalPages = Math.ceil(totalRecords / limit) || 1
  sites.currentPageRecords = sites.length
  sites.limit = limit
  sites.pageNumber = pageNumber
  return sites

}

export class SiteManagementLibrary {

  @route({
    weight: 1,
    method: 'GET',
    name: 'usm__site_listing',
    path: 'usm/sites',
    acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
  })
  static getSites({ req }) {
    const limit = req.query.limit || 20
    const pageNumber = req.query.pageNumber || 1
    const skip = (pageNumber - 1) * limit
    const sort = req.query.sort || { _id: 1 }
    const search = req.query.search

    const searchTerms = getSearchTerms(search)
    const sites = org.objects.c_sites.find(searchTerms)
      .skipAcl()
      .grant('read')
      .paths('c_name', 'c_number', 'c_pi_name', 'c_country', 'c_site_supported_locales', 'c_supported_locales', 'updated', 'c_tz')
      .limit(limit)
      .skip(skip)
      .sort(sort)
      .passive()
      .toList()
    const siteIds = sites.data.map(site => site._id)
    const userCountsBySite = getUserCounts(siteIds)
    sites.data = sites.data.map(site => {
      addUserCountToSite(site, userCountsBySite)
      formatLocaleInfo(site)
      formatSiteUpdatedAt(site)
      return site
    })

    const totalRecords = org.objects.c_sites.find(searchTerms)
      .skipAcl()
      .grant('read')
      .count()

    return {
      data: sites.data,
      hasMore: sites.hasMore,
      totalRecords,
      totalPages: Math.ceil(totalRecords / limit),
      currentPageRecords: sites.data.length,
      limit,
      pageNumber
    }
  }

  @route({
    method: 'GET',
    name: 'usm__site_list_api',
    path: 'usm/site_list',
    acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
  })
  static getSiteList({ req }) {
    const sites = org.objects.c_sites.find()
      .skipAcl()
      .grant('read')
      .paths('c_name', 'c_number')
      .limit(1000)
      .passive()
      .toList()
    return sites
  }

  @route({
    method: 'GET',
    name: 'usm__user_sites_listing',
    path: 'usm/user/:userId/sites',
    acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
  })
  static getSitesByUser({ req }) {
    const { userId } = req.params
    const limit = req.query.limit || 20
    const pageNumber = req.query.pageNumber || 1
    const skip = (pageNumber - 1) * limit
    const sort = req.query.sort || { _id: 1 }
    const search = req.query.search
    const allSites = req.query.allSites
    const searchTerms = getSearchTerms(search)
    const [user] = script.as(script.principal._id, { principal: { skipAcl: true, grant: consts.accessLevels.update } }, () => {
      return org.objects.accounts.find({ _id: userId })
        .paths('roles')
        .passive()
        .toArray()
    })
    if (!user) {
      faults.throw('usm.notFound.account')
    }
    if (isNewPermissionModel) {
      return getSitesFromAccounts(userId, searchTerms, skip, limit, sort, pageNumber)
    }

    const role = script.as(script.principal._id, { principal: { skipAcl: true, grant: consts.accessLevels.update } }, () => {
      return org.objects.c_site_users.readOne({ c_account: userId })
        .throwNotFound(false)
        .paths('c_role')
        .execute()
    })
    // check if user has sites assigned in the old permission model
    let oldSites = {}
    let totalRecordsOld = []
    let siteIds = []
    let sites = []
    if (role) {
      oldSites = script.as(script.principal._id, { principal: { skipAcl: true, grant: consts.accessLevels.update } }, () => {
        return org.objects.c_site_users.find({ c_account: userId, c_role: role.c_role })
          .paths('c_site._id')
          .passive()
          .skip(skip)
          .limit(limit)
          .sort(sort)
          .toList()
      })
      siteIds = (oldSites.data || []).map(site => site.c_site._id)
      sites = script.as(script.principal._id, { principal: { skipAcl: true, grant: consts.accessLevels.update } }, () => {
        return org.objects.c_site.find({ _id: { $in: siteIds } })
          .paths('_id', 'c_name', 'c_number', 'c_country', 'c_pi_name')
          .passive()
          .toArray()
      })

      totalRecordsOld = script.as(script.principal._id, { principal: { skipAcl: true, grant: consts.accessLevels.update } }, () => {
        return org.objects.c_site_users.find({ c_account: userId, c_role: role.c_role })
          .count()
      })
    }

    if (siteIds.length) {
      return {
        data: sites,
        totalPages: Math.ceil(totalRecordsOld / limit) || 1,
        currentPageRecords: siteIds.length,
        limit: limit,
        totalRecords: totalRecordsOld,
        pageNumber: pageNumber,
        hasMore: oldSites.hasMore
      }
    }
    return getSitesFromAccounts(userId, searchTerms, skip, limit, sort, pageNumber)
  }

  @route({
    method: 'PATCH',
    name: 'usm__site_update',
    path: 'usm/sites/:siteId',
    acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
  })
  static updateSite({ req, body }) {
    const supportedOperations = ['unset', 'pull', 'remove', 'set', 'push']
    const siteId = req.params.siteId
    const operations = body()
    const updates = {}

    const [site] = org.objects.c_sites.find({ _id: siteId })
      .skipAcl()
      .grant('read')
      .toArray()
    if (!site) {
      faults.throw('usm.notFound.site')
    }

    for (const operation of operations) {
      const { op, value } = operation
      if (!supportedOperations.includes(op)) {
        throw Fault.create('cortex.unsupportedOperation.patchOp', { path: op, reason: 'Unsupported or missing patch operation (op) property.' })
      }
      if (Object.keys(value).length) {
        updates[`$${op}`] = value
      }
    }

    if (!Object.keys(updates).length) {
      return
    }

    return org.objects.c_sites.updateOne({ _id: siteId }, updates)
      .skipAcl()
      .grant('update')
      .lean(false)
      .execute()
  }

  @route({
    method: 'PATCH',
    name: 'usm__bulk_locale_update',
    path: 'usm/bulk_locale_update',
    acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
  })
  static updateLocale({ body }) {
    const { sites, siteLocales = [], patientLocales = [] } = body()

    if (sites.length > BULK_LOCALE_UPDATE_LIMIT) {
      faults.throw('usm.tooLarge.bulkLocaleUpdate')
    }

    const localeUpdatesArray = []
    let siteInfo = org.objects.c_sites.find({ _id: { $in: sites } })
      .paths('_id', 'c_number', 'c_supported_locales', 'c_site_supported_locales')
      .skipAcl()
      .grant('read')
      .passive()
      .toArray()

    siteInfo = _.keyBy(siteInfo, '_id')
    for (const site of sites) {
      if (!siteInfo[site]) { // skip invalid sites
        continue
      }
      const currentSiteLocales = siteInfo[site].c_site_supported_locales || []
      const currentPatientLocales = siteInfo[site].c_supported_locales || []

      const changedSiteLocales = _.difference(siteLocales, currentSiteLocales)
      const unchangedSiteLocales = _.intersection(siteLocales, currentSiteLocales)
      const changedPatientLocales = _.difference(patientLocales, currentPatientLocales)
      const unchangedPatientLocales = _.intersection(patientLocales, currentPatientLocales)
      localeUpdatesArray.push({
        siteNumber: siteInfo[site].c_number,
        siteLocales: {
          changed: changedSiteLocales,
          unchanged: unchangedSiteLocales
        },
        patientLocales: {
          changed: changedPatientLocales,
          unchanged: unchangedPatientLocales
        }
      })

      if (changedSiteLocales.length === 0 && changedPatientLocales.length === 0) { // skip site if nothing has changed
        continue
      }
      const updatedSiteLocales = [...changedSiteLocales, ...currentSiteLocales]
      const updatedPatientLocales = [...changedPatientLocales, ...currentPatientLocales]
      updateSiteLocaleSingle(site, updatedSiteLocales, updatedPatientLocales)
    }

    return formatResponse(siteLocales, patientLocales, localeUpdatesArray)
  }

  @route({
    method: 'GET',
    name: 'usm__site_ids',
    path: 'usm/user/:userId/siteIds',
    acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
  })
  static getSiteIds({ req }) {
    const userId = req.params.userId
    const [user] = script.as(script.principal._id, { principal: { skipAcl: true, grant: consts.accessLevels.update } }, () => {
      return org.objects.accounts.find({ _id: userId })
        .paths('c_site_access_list', 'roles')
        .passive()
        .toArray()
    })
    if (!user) {
      faults.throw('usm.notFound.account')
    }
    const siteIds = org.objects.c_site_users.find({ c_account: userId })
      .skipAcl()
      .grant('read')
      .paths('c_site._id')
      .passive()
      .map(site => site.c_site._id.toString())
    const userRoles = user.roles || []
    let siteViaAccounts = []
    if (isNewPermissionModel || userRoles.filter(role => EconsentSiteRoles.includes(role.toString()))) {
      siteViaAccounts = (user.c_site_access_list || []).map(site => site.toString())
    }
    const totalSites = siteIds.concat(siteViaAccounts)
    return _.uniq(totalSites)
  }

  // site disabled locales - locales that are already used by participants and can not be removed
  @route({
    method: 'GET',
    name: 'usm__site_disabled_locales',
    path: 'usm/sites/:siteId/disabled_locales',
    acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
  })
  static getSiteDisabledLocales({ req }) {
    const siteId = req.params.siteId

    const allPublicUserLocales = org.objects.c_public_users.aggregate([
      { $match: { c_site: siteId } },
      { $group: { _id: 'c_locale' } }
    ])
      .skipAcl()
      .grant(consts.accessLevels.read)

    return allPublicUserLocales.map((locale) => locale._id)
  }

}