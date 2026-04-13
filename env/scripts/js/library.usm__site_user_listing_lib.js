import { route } from 'decorators'
import faults from 'c_fault_lib'
import { UtilsLibrary, getRoleNames, getRoleIdsFromRoleNames } from 'usm__utils_lib'
const isNewPermissionModel = UtilsLibrary.isNewPermissionModel()

function getSiteUsersNewPermissionModel(options) {
  const { siteId, limit, skip, sort } = options

  const { data: siteUsers, hasMore } = script.as(script.principal._id, { principal: { skipAcl: true, grant: consts.accessLevels.read } }, () => {
    return org.objects.accounts.find({ c_site_access_list: siteId })
      .paths('name', 'email', 'roles', 'state', 'locked')
      .skip(skip)
      .limit(limit)
      .sort(sort)
      .toList()
  })
  if (!siteUsers || !siteUsers.length) {
    return {
      siteUserData: [],
      hasMore: false,
      totalRecords: 0
    }
  }

  const siteUserData = siteUsers.map(siteUser => {
    const { _id, name, email, roles, state, locked } = siteUser
    const mappedState = state === 'verified' ? 'active' : 'pending'
    return {
      _id,
      name,
      email,
      roles,
      roleNames: getRoleNames(roles),
      state: locked ? 'locked' : mappedState
    }
  })

  const totalRecords = script.as(script.principal._id, { principal: { skipAcl: true, grant: consts.accessLevels.read } }, () => {
    return org.objects.accounts.find({ c_site_access_list: siteId })
      .count()
  })

  return {
    siteUserData,
    hasMore,
    totalRecords
  }
}

function getSiteUsersOldPermissionModel(options) {
  const { siteId, limit, skip, sort } = options
  let siteUsersWithoutAccount = 0

  const { data: siteUsers, hasMore } = script.as(script.principal._id, { principal: { skipAcl: true, grant: consts.accessLevels.read } }, () => {
    return org.objects.c_site_users.find({ 'c_site._id': siteId })
      .paths('c_account.name', 'c_account.email', 'c_account.roles', 'c_account.state', 'c_account.locked', 'c_role')
      .skip(skip)
      .limit(limit)
      .sort(sort)
      .toList()
  })
  if (!siteUsers || !siteUsers.length) {
    return {
      siteUserData: [],
      hasMore: false,
      totalRecords: 0
    }
  }

  const siteUserData = siteUsers.map(siteUser => {
    let { _id = '', name = { first: '', last: '' }, email = '', roles = [], state = 'locked', locked } = siteUser.c_account
    if (typeof name === 'string') {
      siteUsersWithoutAccount++
      return undefined
    }
    _id = siteUser && siteUser._id
    const mappedState = state === 'verified' ? 'active' : 'pending'
    return {
      _id,
      name,
      email,
      roles: [...roles, ...getRoleIdsFromRoleNames([siteUser.c_role])],
      roleNames: [...getRoleNames(roles), siteUser.c_role],
      state: locked ? 'locked' : mappedState,
      accountId: siteUser.c_account && siteUser.c_account._id
    }
  })

  const totalRecords = script.as(script.principal._id, { principal: { skipAcl: true, grant: consts.accessLevels.read } }, () => {
    return org.objects.c_site_users.find({ 'c_site._id': siteId })
      .count()
  })

  return {
    siteUserData: siteUserData.filter(Boolean),
    hasMore,
    totalRecords: totalRecords - siteUsersWithoutAccount
  }
}

export class SiteUserListingLibrary {

    @route({
      method: 'GET',
      name: 'usm__site_user_listing',
      path: 'usm/sites/:siteId/users',
      acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
    })
  static getSiteUsers({ req }) {
    const { siteId } = req.params
    const limit = req.query.limit || 20
    const pageNumber = req.query.pageNumber || 1
    const skip = (pageNumber - 1) * limit
    const sort = req.query.sort || { _id: 1 }

    if (!org.objects.c_site.find({ _id: siteId })
      .skipAcl()
      .grant('read')
      .hasNext()) {
      faults.throw('usm.notFound.site')
    }

    let data
    if (isNewPermissionModel) {
      data = getSiteUsersNewPermissionModel({ siteId, limit, skip, sort })
    } else {
      data = getSiteUsersOldPermissionModel({ siteId, limit, skip, sort })
    }
    const { siteUserData, hasMore, totalRecords } = data

    return {
      data: siteUserData,
      hasMore,
      totalRecords,
      totalPages: Math.ceil(totalRecords / limit),
      currentPageRecords: siteUserData.length,
      limit,
      pageNumber
    }
  }

}