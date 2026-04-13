import schemas from 'schemas'
import _ from 'lodash'
import { route } from 'decorators'
import { UtilsLibrary, getRoleNames, getRolesWithAllSiteAccess, getRoleIdsFromRoleNames, sanitizeUrlParams, AccountRolesAssignableToSiteUsers, getOrgSitesCount, convertToLoggedInUserTz } from 'usm__utils_lib'

const isNewPermissionModel = UtilsLibrary.isNewPermissionModel()
const ROLES_WITH_ALL_SITE_ACCESS = getRolesWithAllSiteAccess()
const studyParticipantRole = consts.roles.c_study_participant

function getSearchTerms(search) {
  search = sanitizeUrlParams(search)
  if (search.split(' ').length > 1) { // first and last name passed as search
    const nameArray = search.split(' ')
    return {
      $and: [
        { 'name.first': { $regex: `/^${nameArray[0]}/i` } },
        {
          'name.last': {
            $regex: `/^${nameArray.splice(1) // join all names that are not the first name and search as the last name
              .join(' ')}/i`
          }
        }
      ]
    }
  } else if (UtilsLibrary.isEmail(search)) {
    return {
      email: { $regex: `/^${UtilsLibrary.escapeRegex(search)}/i` }
    }
  } else {
    return {
      $or: [
        { 'name.first': { $regex: `/^${UtilsLibrary.escapeRegex(search)}/i` } },
        { 'name.last': { $regex: `/^${UtilsLibrary.escapeRegex(search)}/i` } },
        { email: { $regex: `/^${UtilsLibrary.escapeRegex(search)}/i` } }
      ]
    }
  }
}

function getSites(options) {
  const { roles, c_site_access_list, c_sites, siteUserSites, isMultipleSites } = options
  const orgSitesCount = getOrgSitesCount()
  if (roles.some(role => ROLES_WITH_ALL_SITE_ACCESS.includes(role.toString()))) {
    return 'All Sites'
  }
  if (isMultipleSites) {
    return 'Multiple Sites'
  }
  let sitesAccess = []
  if (isNewPermissionModel) {
    sitesAccess = getSitesFromAccount(c_site_access_list, c_sites, sitesAccess)
  }
  if (Array.isArray(siteUserSites)) {
    // return siteUserSites
    if (siteUserSites.length === 1) {
      sitesAccess.push(siteUserSites[0])
    } else if (siteUserSites.length > 1) {
      return 'Multiple Sites'
    }
  }
  if (roles.filter(role => AccountRolesAssignableToSiteUsers.includes(role.toString()))) {
    sitesAccess = getSitesFromAccount(c_site_access_list, c_sites, sitesAccess)
  }
  sitesAccess = _.uniq(sitesAccess)
  if (sitesAccess.length === 1) {
    return sitesAccess[0]
  } else if (sitesAccess.length > 1) {
    return 'Multiple Sites'
  }
  return ''
}

function getSitesFromAccount(c_site_access_list, c_sites, sitesAccess) {
  if (c_site_access_list && c_site_access_list.length === 1 && c_sites && c_sites.data.length) {
    sitesAccess.push(`${c_sites.data[0].c_number} ${c_sites.data[0].c_name}`)
  }
  return sitesAccess
}

function getUserListingPipeline(searchTerms) {
  const accountSchemaProperties = schemas.read('account').properties
  const isSiteInfoAvailable = accountSchemaProperties.filter(property => property.name === 'c_site_access_list' || property.name === 'c_sites').length === 2 // we need both c_sites and c_site_access_list
  const isLoginMethodsAvailable = accountSchemaProperties.some(property => property.name === 'loginMethods')

  const project = {
    $project: {
      name: 1,
      email: 1,
      username: 1,
      roles: 1,
      state: 1,
      locked: 1,
      ...(isSiteInfoAvailable && { c_site_access_list: 1 }),
      ...(isLoginMethodsAvailable && { loginMethods: 1 }),
      hasParticipantRole: {
        $setIsSubset: [[{ $objectId: studyParticipantRole }], 'roles']
      },
      updated: 1
    }
  }

  const match = {
    $match: {
      ...searchTerms,
      hasParticipantRole: false
    }
  }

  return [project, match]
}

function getTotalUsersPipeline(searchTerms) {
  const project = {
    $project: {
      _id: 1,
      name: 1,
      email: 1,
      hasParticipantRole: {
        $setIsSubset: [[{ $objectId: studyParticipantRole }], 'roles']
      }
    }
  }

  const match = {
    $match: {
      ...searchTerms,
      hasParticipantRole: false
    }
  }

  const group = { $group: { _id: null, total: { $sum: 1 } } }
  return [project, match, group]
}

function getAccounts(pipeline, limit, skip, sort) {
  return script.as(script.principal._id, { principal: { skipAcl: true, grant: consts.accessLevels.read } }, () => {
    return org.objects.accounts.aggregate(pipeline)
      .limit(limit)
      .skip(skip)
      .sort(sort)
      .toList()
  })
}

function getTotalUsers(searchTerms) {
  const pipeline = getTotalUsersPipeline(searchTerms)
  return script.as(script.principal._id, { principal: { skipAcl: true, grant: consts.accessLevels.read } }, () => {
    const result = org.objects.accounts.aggregate(pipeline)
      .toArray()
    return result && result.length && result[0].total
  })
}

function getUsersNewPermissionModel(options) {
  const { limit, pageNumber, sort, search } = options
  const skip = (pageNumber - 1) * limit
  const searchTerms = search && getSearchTerms(search)
  const pipeline = getUserListingPipeline(searchTerms)
  const accounts = getAccounts(pipeline, limit, skip, sort)

  // retrieve site details of users who are only assigned to one site
  const siteLists = accounts.data.filter(account => Array.isArray(account.c_site_access_list) && account.c_site_access_list.length === 1)
    .map(account => account.c_site_access_list)
  const uniqueSiteIds = _.uniq(_.flatten(siteLists))
    .filter(Boolean)

  const userData = accounts.data.map(account => {
    const { _id, name, email, username, roles, state, locked, loginMethods, updated } = account
    const { c_site_access_list = [] } = account

    let isMultipleSites = false
    const c_sites = {}
    if (Array.isArray(c_site_access_list)) {
      if (c_site_access_list.length > 1) {
        isMultipleSites = true
      } else {
        const siteData = script.as(script.principal._id, { principal: { skipAcl: true, grant: consts.accessLevels.read } }, () => {
          return org.objects.c_site.find({ _id: { $in: c_site_access_list } })
            .skipAcl()
            .grant('read')
            .paths('c_number', 'c_name')
            .toArray()
        })
        c_sites.data = siteData || []
      }
    }
    const mappedState = state === 'verified' ? 'active' : 'pending'
    return {
      _id,
      name,
      email,
      username: username || '',
      roles,
      roleNames: getRoleNames(roles),
      sites: getSites({ roles, c_site_access_list, c_sites, isMultipleSites }),
      state: locked ? 'locked' : mappedState,
      loginMethods,
      updated: convertToLoggedInUserTz(updated)
    }
  })

  const totalRecords = getTotalUsers(searchTerms)
  return {
    data: userData,
    hasMore: accounts.hasMore,
    totalRecords,
    totalPages: Math.ceil(totalRecords / limit),
    currentPageRecords: userData.length,
    limit,
    pageNumber
  }
}

function getUsersOldPermissionModel(options) {
  const { limit, pageNumber, sort, search } = options
  const skip = (pageNumber - 1) * limit
  const searchTerms = search && getSearchTerms(search)
  const pipeline = getUserListingPipeline(searchTerms)
  const accounts = getAccounts(pipeline, limit, skip, sort)

  const accountIds = accounts.data.map(account => account._id)
  const siteUsers = script.as(script.principal._id, { principal: { skipAcl: true, grant: consts.accessLevels.read } }, () => {
    return org.objects.c_site_users.find({ 'c_account._id': { $in: accountIds } })
      .paths('c_account._id', 'c_site._id', 'c_role')
      .toArray()
  })
  const siteUsersGroupedByAccount = _.groupBy(siteUsers, (siteUser) => siteUser.c_account._id.toString())
  const userData = accounts.data.map((account) => {
    let isMultipleSites = false
    const { _id, name, email, username, roles, state, locked, c_site_access_list = [], loginMethods, updated } = account
    const mappedState = state === 'verified' ? 'active' : 'pending'
    let siteUserSites = []
    let userSiteRoles = []
    const c_sites = { data: [] }
    const siteUserByAccount = siteUsersGroupedByAccount[account._id.toString()] || []
    let siteUserSitesIds = _.uniq(siteUserByAccount.map(siteUser => siteUser.c_site._id.toString()))
    const uniqSite = c_site_access_list.map(s => s.toString())
    siteUserSitesIds = _.uniq(siteUserSitesIds.concat(uniqSite))
    if (siteUserSitesIds.length > 1) {
      isMultipleSites = true
      siteUserSites = siteUserSitesIds // doing this to set sites to 'All Sites' if the site count is equal to the total org sites
    } else if (siteUserSitesIds.length === 1) {
      const siteData = script.as(script.principal._id, { principal: { skipAcl: true, grant: consts.accessLevels.read } }, () => {
        return org.objects.c_site.find({ _id: { $in: siteUserSitesIds } })
          .skipAcl()
          .grant('read')
          .paths('c_number', 'c_name')
          .toArray()
      })
      siteUserSites = (siteData.length && [`${siteData[0].c_number} ${siteData[0].c_name}`]) || []
      c_sites.data = (siteData) || []
    }
    userSiteRoles = _.uniq(siteUserByAccount.map(siteUser => siteUser.c_role))

    if (Array.isArray(c_site_access_list) && c_site_access_list.length > 1) {
      isMultipleSites = true
    }

    return {
      _id,
      name,
      email,
      username: username || '',
      roles: [...roles, ...getRoleIdsFromRoleNames(userSiteRoles)],
      roleNames: [...getRoleNames(roles), ...(userSiteRoles || [])],
      sites: getSites({ roles, siteUserSites, c_site_access_list, c_sites, isMultipleSites }),
      state: locked ? 'locked' : mappedState,
      loginMethods,
      updated: convertToLoggedInUserTz(updated)
    }
  })

  const totalRecords = getTotalUsers(searchTerms)
  return {
    data: userData,
    hasMore: accounts.hasMore,
    totalRecords,
    totalPages: Math.ceil(totalRecords / limit),
    currentPageRecords: userData.length,
    limit,
    pageNumber
  }
}

export class UserListingLibrary {

    @route({
      method: 'GET',
      name: 'usm__user_listing',
      path: 'usm/users',
      acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
    })
  static getUsers({ req }) {
    const limit = req.query.limit || 20
    const pageNumber = req.query.pageNumber || 1
    const sort = req.query.sort || { _id: 1 }
    const search = req.query.search

    if (isNewPermissionModel) {
      return getUsersNewPermissionModel({ limit, pageNumber, sort, search })
    }
    return getUsersOldPermissionModel({ limit, pageNumber, sort, search })
  }

}