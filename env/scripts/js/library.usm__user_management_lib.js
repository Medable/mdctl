import { as, route, log } from 'decorators'
import config from 'config'
import faults from 'c_fault_lib'
import { difference, intersection, pick, uniq, chunk, omitBy, isNil, isEqual } from 'lodash'
import { UtilsLibrary, getSiteRoles, getRoleToNameMapping, AccountRolesAssignableToSiteUsers, EconsentSiteRoles, SharedRoles, manageSitesInNewPermissionModel, manageSitesInOldPermissionModel, segregateSiteAndAccountLevelRoles, provisionAccount, skipValidation, OldSiteRoles, LoginMethodsUpdateAllowed, manageSitesInOldPermissionModelSingleUser, isUserAndSiteManager } from 'usm__utils_lib'
import { validateUsernameMatchesPattern, AccountConfiguration } from 'usm__validation_utils_lib'
import { RoleIdsNotAccessibleToUSMUser } from 'usm__consts'
import response from 'response'
import { id } from 'util'
import logger from 'logger'

const { usm__bulk_request, account: Account, c_site_users, c_site, org: Org } = org.objects
const { maxItemsInBulkRequest: MaxItemsInBulkRequest, maxItemsInOneBatch } = config.get('usm__configuration') || {}
const isNewPermissionModel = UtilsLibrary.isNewPermissionModel()
const RoleNameMap = getRoleToNameMapping()

const ValidationFailedException = 'ValidationFailedException'
const ValidationErrors = {
  SITE_BUT_NO_ROLE: { sites: 'Sites cannot be assigned without a corresponding role' },
  USERNAME_OR_EMAIL_REQUIRED: { email: 'Atleast one of email or username should be present' },
  USERNAME_EMAIL_MISMATCH: { _: 'Username and email do not belong to the same account' },
  USERNAME_CANT_BE_EMAIL: { username: 'Username cannot be email' },
  USERNAME_PATTERN_MISMATCH: { username: 'Username does not match the configured pattern' },
  INVALID_ROLE: { roles: 'Invalid role' },
  INVALID_SITE: { sites: 'Invalid site' },
  NO_ACCOUNT_ROLE_TO_SITE_ROLE: { roles: 'User has site level role, cannot assign account level role' },
  NO_SITE_ROLE_TO_ACCOUNT_ROLE: { roles: 'User has account level role, cannot assign site level role' },
  NOT_ENOUGH_PERMISSION_TO_ADD_ROLE: { roles: 'You do not have enough permissions to add one or more roles present in the request' },
  SITE_AND_ACCOUNT_ROLE_MIXED: { roles: 'New roles have mix of site level and account level roles' },
  WARN_EXISTING_USER_UPDATE: { _: 'Existing User: New roles will be added to existing roles' },
  WARN_EXISTING_SITE_USER_UPDATE: { _: 'Existing User: New roles and already assigned sites will be added' },
  EMAIL_REQUIRED: { email: 'Email is required' },
  USERNAME_REQUIRED: { username: 'Username is required' },
  MOBILE_REQUIRED: { mobile: 'Mobile is required' },
  INPUT_DATA_DISCREPANCY: { _: 'Different data for same email/username already present' }
}
const AllRoles = Object.values(consts.roles)
  .map(role => role.toString())
const AllSites = c_site.find()
  .skipAcl()
  .grant('read')
  .paths('_id')
  .map(site => site._id.toString())

export class UserManagementLibrary {

  @route({
    method: 'POST',
    name: 'usm__bulk_validate',
    path: 'usm/bulk_validate',
    acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
  })
  static validateBulkUserRequest({ body }) {
    const { action, accountsToProvision } = body()
    if (!action || !accountsToProvision) {
      faults.throw('cortex.invalidArgument.validation')
    }

    if (accountsToProvision.length > MaxItemsInBulkRequest) {
      faults.throw('usm.tooLarge.accountsToProvision')
    }
    const validationErrors = {}
    const preparedPayload = preparePayloadForValidation({ accountsToProvision, validationErrors })
    const existingAccounts = getExistingAccounts(preparedPayload)
    dryRunBulkInsertForValidation({ preparedPayload, validationErrors })
    const siteRoles = getSiteRoles()
    for (const accountToProvision of preparedPayload) {
      try {
        validateAccountIdentifier({ accountToProvision, validationErrors, existingAccounts })
        validateRolesFormat({ accountToProvision, validationErrors })
        /*
          if ANY site role is being assigned( including Econsent Manager role), then valid site should also be present.
          on the other hand if no site role is being assigned, sites should be empty
        */
        const existingAccount = existingAccounts[accountToProvision.email] || existingAccounts[accountToProvision.username]
        const isSiteUser = isThisSiteUser(existingAccount, siteRoles)

        if (accountToProvision.roles.find(role => siteRoles.concat(...EconsentSiteRoles)
          .includes(role))) {
          /*
            If this user already has some sites assigned, we merge the exisiting sites to the sites coming in payload
          */
          if (isSiteUser) {
            mergeExistingSites({ accountToProvision, existingAccount })
          }
          validateSitesFormat({ accountToProvision, validationErrors, existingAccount })
        } else if (accountToProvision.sites && accountToProvision.sites.length) {
          addValidationError(accountToProvision, validationErrors, ValidationErrors.SITE_BUT_NO_ROLE)
        }
        if (existingAccount) {
          validateNewRolesCanBeAssignedToExistingUser({ isSiteUser, accountToProvision, existingAccount, validationErrors, siteRoles })
        } else {
          validateRequiredFieldsArePresent({ accountToProvision, validationErrors })
          validateRoleCombinationIsValid({ accountToProvision, validationErrors, siteRoles })
        }
      } catch (ValidationFailedException) {
        /*
          if one validation fails, we don't proceed for other validations for now
          as some validations don't make senese to be applied together
          for example, if site id to be assigned is invalid, do we still check if the user can be assigned a site role?
          solution to this could be a more logical sequence of validations, but skipping for now
        */
      }

    }
    return formatResponse(preparedPayload, existingAccounts, validationErrors)

  }

  @route({
    method: 'POST',
    name: 'usm__bulk_execute',
    path: 'usm/bulk_execute',
    acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
  })
  static validateAndExecuteBulkRequest({ body }) {
    const batches = [],
          maxItemCountToProcessInOneBatch = maxItemsInOneBatch || 25

    const validationResponse = this.validateBulkUserRequest({ body })
    if (validationResponse.totalErrors) {
      response.setStatusCode(400)
      return { validationResponse, status: 400 }
    }

    const accountsToProcess = []

    for (const account of validationResponse.data) {
      const batchItem = {
        usm__username: account.username,
        usm__email: account.email,
        usm__sites: account.sites,
        usm__roles: account.newRoles,
        usm__firstName: account.firstName,
        usm__lastName: account.lastName,
        usm__timeZone: account.timeZone,
        usm__mobile: account.mobile,
        usm__loginMethods: account.loginMethods
      }

      accountsToProcess.push(batchItem)

    }

    // Group the remaining items in batches for faster processing in case of large request
    // each of these batches will be processed in a separate event
    for (const itemsPerBatch of chunk(accountsToProcess, maxItemCountToProcessInOneBatch)) {
      batches.push({ usm__items: itemsPerBatch })
    }

    const newBulkRequest = usm__bulk_request.insertOne({ usm__batches: batches, usm__action: 'create' })
      .bypassCreateAcl()
      .grant('update')
      .lean(false)
      .execute()

    return {
      pollUrl: `routes/usm/bulk_execute/${newBulkRequest._id}`,
      status: 'pending'
    }

  }

  @route({
    method: 'GET',
    name: 'usm__bulk_execute_status',
    path: 'usm/bulk_execute/:id',
    acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
  })
  static getBulkRequestStatus({ req }) {
    const { params: { id } } = req
    const bulkRequest = usm__bulk_request.find({ _id: id })
      .include('usm__batches')
      .paths('usm__batches')
      .next()
    const allStatus = bulkRequest.usm__batches.map(batch => batch.usm__status)
    let status

    if (allStatus.includes('failed') || allStatus.includes('pending')) {
      status = 'pending'
    } else {
      status = 'successful'
    }

    return { status }
  }

  @route({
    method: 'POST',
    name: 'usm__bulk_manage',
    path: 'usm/bulk_manage',
    acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
  })
  static bulkManageUsers({ body }) {
    const { accountIds, action } = body()
    const batches = [],
          maxItemCountToProcessInOneBatch = maxItemsInOneBatch || 25
    if (!['unlock', 'lock', 'resetPassword'].includes(action)) {
      faults.throw('cortex.invalidArgument.validation')
    }
    if (!accountIds || !accountIds.length) {
      faults.throw('cortex.invalidArgument.validation')
    }

    for (const batchAccounts of chunk(accountIds, maxItemCountToProcessInOneBatch)) {
      const batchItems = batchAccounts.map(account => { return { usm__accountId: account } })
      batches.push({ usm__items: batchItems, usm__type: 'async' })
    }

    const newBulkRequest = usm__bulk_request.insertOne({ usm__batches: batches, usm__action: action })
      .bypassCreateAcl()
      .grant('update')
      .lean(false)
      .execute()

    return {
      pollUrl: `routes/usm/bulk_manage/${newBulkRequest._id}`,
      status: 'pending'
    }
  }

  @route({
    method: 'GET',
    name: 'usm__bulk_manage_status',
    path: 'usm/bulk_manage/:id',
    acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
  })
  static getBulkManageStatus({ req }) {
    const { params: { id } } = req
    const bulkRequest = usm__bulk_request.find({ _id: id })
      .include('usm__batches')
      .paths('usm__batches')
      .next()
    const allStatus = bulkRequest.usm__batches.map(batch => batch.usm__status)
    let status

    if (allStatus.includes('failed') || allStatus.includes('pending')) {
      status = 'pending'
    } else {
      status = 'successful'
    }

    return { status }
  }

  @log({ traceError: true })
  @route({
    method: 'PUT',
    name: 'usm__update_patch_user',
    path: 'usm/patch/users/:accountId',
    acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
  })
  @as(script.principal, { principal: { roles: 'support' }, modules: { safe: false }, acl: { safe: false } })
  static updatePatchUser({ req, body }) {
    const { params: { accountId } } = req
    const { firstName, lastName, username, email, mobile, roles, userTimezone: timeZone, sites, loginMethods } = body()
    const accountToProvision = omitBy({ firstName, lastName, username, email, mobile, roles, timeZone, sites, loginMethods }, isNil)
    const existingAccount = Account.readOne({ _id: accountId })
      .throwNotFound(false)
      .skipAcl()
      .grant('read')
      .include('c_site_access_list')
      .execute()
    if (!existingAccount) {
      faults.throw('cortex.notFound.account')
    }
    const accountUpdateAttributes = omitBy({ username, email, mobile, roles, tz: timeZone }, isNil)
    if (LoginMethodsUpdateAllowed && loginMethods) {
      accountUpdateAttributes.loginMethods = loginMethods
    }
    accountUpdateAttributes.name = omitBy({ first: firstName, last: lastName }, isNil)
    const validationErrors = {}
    const siteRoles = getSiteRoles()

    // If 'roles' is not being passed, we will set it to all existing roles
    if (!accountToProvision.roles) {
      accountToProvision.roles = []
    }

    // If 'sites' is not being passed, we will set it to all existing sites
    if (!accountToProvision.sites) {
      accountToProvision.sites = []
    }

    try {
      dryRunBulkInsertForValidation({ preparedPayload: [accountToProvision], validationErrors })
      if (accountToProvision.roles && accountToProvision.roles.length) {
        validateRolesFormat({ accountToProvision, validationErrors })
      }
      existingAccount.roles = accountToProvision.roles
      let isSiteUser = false
      if (accountToProvision.roles && accountToProvision.roles.length && accountToProvision.roles.find(role => siteRoles.concat(...EconsentSiteRoles)
        .includes(role))) {
        isSiteUser = isThisSiteUser(existingAccount, siteRoles)
        validateSitesFormat({ accountToProvision, validationErrors, isSiteUser, existingAccount })
      } else if (accountToProvision.sites && accountToProvision.sites.length) {
        addValidationError(accountToProvision, validationErrors, ValidationErrors.SITE_BUT_NO_ROLE)
      }

      if (accountToProvision.roles) {
        validateNewRolesCanBeAssignedToExistingUser({ isSiteUser, accountToProvision, existingAccount, validationErrors, siteRoles })
      }
      const { userSiteRoles, userAccountRoles } = segregateSiteAndAccountLevelRoles(accountToProvision.roles, accountToProvision.sites, siteRoles)

      if (userSiteRoles && userSiteRoles.length) {
        accountUpdateAttributes.roles = userAccountRoles
      }
      /*
        Don't proceeed with account or site update if any validation failure has happened
      */
      if (Object.values(validationErrors).length) {
        throw (ValidationFailedException)
      }
      if (!userAccountRoles.find(role => siteRoles.concat(...EconsentSiteRoles)
        .includes(role)) && existingAccount.c_site_access_list && existingAccount.c_site_access_list.length) {
        Account.updateOne({ _id: accountId }, { $set: { c_site_access_list: [] } })
          .skipAcl()
          .passive()
          .grant('script')
          .execute()
      }

      const hasAttributesToUpdate = Object.values(accountUpdateAttributes)
        .filter(v => v).length
      if (hasAttributesToUpdate) {
        Account.updateOne({ _id: accountId }, { $set: { ...accountUpdateAttributes } })
          .skipAcl()
          .grant('script')
          .execute()
      }

      const numberOfSitesToProcess = manageUserSites({ accountId, sites: accountToProvision.sites, userSiteRoles, userAccountRoles })

      if (numberOfSitesToProcess) {
        const waitTime = getClietWaitTime(numberOfSitesToProcess)
        return { accountId, waitTime }
      }
      return { accountId }
    } catch (error) {

      response.setStatusCode(400)
      // logging expected "ValidationFailed" exception and also any other exceptions
      logger.error(JSON.stringify(error))
      let vaildationErrors = []
      const faults = error && error.faults ? error.faults : []
      let errors = []
      errors = faults.map((fault, index) => {
        const paths = fault.path ? fault.path : ''
        const fileds = paths.split('.')
        const message = fault.message ? fault.message : 'Invalid input'
        if (fileds.length > 1) {
          return { [fileds[1]]: message }
        }
        return undefined
      })

      if (error && error.path) {
        const paths = error.path ? error.path : ''
        errors = errors.concat([{ [paths]: error.reason || 'Invalid input' }])
      }
      if (Object.values(validationErrors).length) {
        vaildationErrors = Object.values(validationErrors)[0] || []
      }

      return {
        status: 400,
        errors: vaildationErrors.concat(errors)
          .filter(Boolean)
      }

    }
  }

  // This route is used to do administrative actions on a user like lock, unlock, reset password
  @log({ traceError: true })
  @route({
    method: 'PUT',
    name: 'usm__user_administration',
    path: 'usm/users/admin/:accountId',
    acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
  })
  @as(script.principal, { principal: { roles: 'support' }, modules: { safe: false }, acl: { safe: false } })
  static administerUser({ req, body }) {
    const { params: { accountId } } = req

    try {
      const updatedAccount = org.objects.account.admin.update(
        accountId,
        body()
      )

      return updatedAccount
    } catch (error) {
      return error
    }
  }

  // This route is used to delete user accounts
  @log({ traceError: true })
  @route({
    method: 'DELETE',
    name: 'usm__user_delete',
    path: 'usm/users/admin/:accountId',
    acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
  })
  @as(script.principal, { principal: { roles: 'administrator' }, modules: { safe: false }, acl: { safe: false } })
  static deleteUser({ req }) {
    const { params: { accountId } } = req
    const { administrator } = consts.roles

    try {
      // check if account is administrator
      const accountCursor = org.objects.account.find({ _id: accountId })
        .paths('roles')
        .skipAcl()
        .grant('read')

      // if account not found, throw proper 404 error
      if (!accountCursor.hasNext()) {
        throw (
          {
            object: 'fault',
            name: 'error',
            code: 'kNotFound',
            errCode: 'cortex.notFound.account',
            status: 404,
            reason: 'Account not found',
            message: 'Account not found.'
          }
        )
      }
      // grab account record from cursor
      const account = accountCursor.next()
      // check if account is administrator
      const isAdmin = id.inIdArray(account.roles, administrator)
      // throw error if account is administrator and cannot be deleted
      if (isAdmin) {
        throw (
          {
            object: 'fault',
            name: 'error',
            code: 'kAccessDenied',
            errCode: 'cortex.accessDenied.unspecified',
            status: 403,
            reason: 'Cannot remove Administrator accounts',
            message: 'Access denied.'
          }
        )
      }
      // delete account
      return org.objects.accounts.deleteOne({ _id: accountId })
        .grant('delete')
        .execute()
    } catch (error) {
      return error
    }
  }

  @log({ traceError: true })
  @route({
    method: 'PUT',
    name: 'usm__update_user',
    path: 'usm/users/:accountId',
    acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
  })
  static updateUser({ req, body }) {
    const { params: { accountId } } = req
    const { firstName, lastName, username, email, mobile, roles, userTimezone: timeZone, sites } = body()
    const accountToProvision = omitBy({ firstName, lastName, username, email, mobile, roles, timeZone, sites }, isNil)

    const existingAccount = Account.readOne({ _id: accountId })
      .throwNotFound(false)
      .skipAcl()
      .grant('read')
      .include('c_site_access_list')
      .execute()
    if (!existingAccount) {
      faults.throw('cortex.notFound.account')
    }

    const accountUpdateAttributes = omitBy({ username, email, mobile, roles, tz: timeZone }, isNil)
    accountUpdateAttributes.name = omitBy({ first: firstName, last: lastName }, isNil)
    const validationErrors = {}
    const siteRoles = getSiteRoles()

    // If 'roles' is not being passed, we will set it to all existing roles
    if (!accountToProvision.roles) {
      accountToProvision.roles = getUserRoles(existingAccount)
    }

    // If 'sites' is not being passed, we will set it to all existing sites
    if (!accountToProvision.sites) {
      accountToProvision.sites = getUserSites(existingAccount)
    }

    try {
      dryRunBulkInsertForValidation({ preparedPayload: [accountToProvision], validationErrors })
      if (accountToProvision.roles && accountToProvision.roles.length) {
        validateRolesFormat({ accountToProvision, validationErrors })
      }
      const isSiteUser = isThisSiteUser(existingAccount, siteRoles)
      if (accountToProvision.roles && accountToProvision.roles.length && accountToProvision.roles.find(role => siteRoles.concat(...EconsentSiteRoles)
        .includes(role))) {
        validateSitesFormat({ accountToProvision, validationErrors, isSiteUser, existingAccount })
      } else if (accountToProvision.sites && accountToProvision.sites.length) {
        addValidationError(accountToProvision, validationErrors, ValidationErrors.SITE_BUT_NO_ROLE)
      }

      if (accountToProvision.roles) {
        validateNewRolesCanBeAssignedToExistingUser({ isSiteUser, accountToProvision, existingAccount, validationErrors, siteRoles })
      }
      const { userSiteRoles, userAccountRoles } = segregateSiteAndAccountLevelRoles(accountToProvision.roles, accountToProvision.sites, siteRoles)

      if (userAccountRoles && userAccountRoles.length) {
        accountUpdateAttributes.roles = userAccountRoles
      }
      /*
        Don't proceeed with account or site update if any validation failure has happened
      */
      if (Object.values(validationErrors).length) {
        throw (ValidationFailedException)
      }
      Account.updateOne({ _id: accountId }, { $set: { ...accountUpdateAttributes } })
        .skipAcl()
        .grant('script')
        .execute()
      manageUserSites({ accountId, sites: accountToProvision.sites, userSiteRoles, userAccountRoles })
      return { accountId }
    } catch (error) {

      response.setStatusCode(400)
      // logging expected "ValidationFailed" exception and also any other exceptions
      logger.error(JSON.stringify(error))
      let vaildationErrors = []
      const faults = error && error.faults ? error.faults : []
      let errors = []
      errors = faults.map((fault, index) => {
        const paths = fault.path ? fault.path : ''
        const fileds = paths.split('.')
        const message = fault.message ? fault.message : 'Invalid input'
        if (fileds.length > 1) {
          return { [fileds[1]]: message }
        }
        return undefined
      })

      if (error && error.path) {
        const paths = error.path ? error.path : ''
        errors = errors.concat([{ [paths]: error.reason || 'Invalid input' }])
      }
      if (Object.values(validationErrors).length) {
        vaildationErrors = Object.values(validationErrors)[0] || []
      }

      return {
        status: 400,
        errors: vaildationErrors.concat(errors)
          .filter(Boolean)
      }

    }
  }

  @route({
    method: 'POST',
    name: 'usm__create_user',
    path: 'usm/users',
    acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
  })
  @as(script.principal, { principal: { roles: 'support' }, modules: { safe: false }, acl: { safe: false } })
  static createUser({ body }) {
    const { firstName, lastName, username, email, mobile, roles, userTimezone: timeZone, sites, loginMethods } = body()
    const accountToProvision = {
      firstName, lastName, username, email, mobile, roles, timeZone, sites, loginMethods
    }

    const accountCreationAttributes = omitBy({ username, email, mobile, roles, tz: timeZone, loginMethods }, isNil)
    if (firstName || lastName) {
      accountCreationAttributes.name = omitBy({ first: firstName, last: lastName }, isNil)
    }
    const validationErrors = {}, existingAccount = false
    try {
      dryRunBulkInsertForValidation({ preparedPayload: [accountToProvision], validationErrors })
      const siteRoles = getSiteRoles()
      validateRolesFormat({ accountToProvision, validationErrors })
      validatePermissionToAddRoles({ accountToProvision, validationErrors })
      accountCreationAttributes.roles = accountCreationAttributes.roles || []
      if (accountCreationAttributes.roles.find(role => siteRoles.concat(...EconsentSiteRoles)
        .includes(role))) {
        validateSitesFormat({ accountToProvision, validationErrors, existingAccount })
      } else if (accountToProvision.sites && accountToProvision.sites.length) {
        addValidationError(accountToProvision, validationErrors, ValidationErrors.SITE_BUT_NO_ROLE)
      }

      validateRequiredFieldsArePresent({ accountToProvision, validationErrors })
      validateRoleCombinationIsValid({ accountToProvision, validationErrors, siteRoles })
      const { userSiteRoles, userAccountRoles } = segregateSiteAndAccountLevelRoles(roles, sites, siteRoles)

      const { _id: accountId } = provisionAccount({ ...accountCreationAttributes, roles: userAccountRoles })
      if ((userSiteRoles && userSiteRoles.length) || (isNewPermissionModel && sites && sites.length)) {
        manageUserSites({ accountId, sites, userSiteRoles, userAccountRoles })
      }
      if (userSiteRoles && userSiteRoles.length && sites && sites.length) {
        const waitTime = getClietWaitTime(sites.length)
        return { accountId, waitTime }
      }
      return { accountId }
    } catch (error) {

      response.setStatusCode(400)
      // logging expected "ValidationFailed" exception and also any other exceptions
      logger.error(JSON.stringify(error))
      let vaildationErrors = []
      const faults = error && error.faults ? error.faults : []
      let errors = []
      errors = faults.map((fault, index) => {
        const paths = fault.path ? fault.path : ''
        const fileds = paths.split('.')
        const message = fault.message ? fault.message : 'invalid input'
        if (fileds.length > 1) {
          return { [fileds[1]]: message }
        }
        return undefined
      })
      if (error && error.path) {
        const paths = error.path ? error.path : ''
        errors = errors.concat([{ [paths]: error.reason || 'Invalid input' }])
      }
      if (Object.values(validationErrors).length) {
        vaildationErrors = Object.values(validationErrors)[0] || []
      }

      return {
        status: 400,
        errors: vaildationErrors.concat(errors)
          .filter(Boolean)
      }
    }
  }

}

function getUserRoles(account) {
  const roles = c_site_users.find({ c_account: account._id })
    .skipAcl()
    .grant('read')
    .paths('c_role')
    .toArray()
    .map(siteUser => consts.roles[siteUser.c_role].toString())
  return roles.concat(account.roles.map(roleId => roleId.toString()))
}

function getUserSites(account) {
  const sites = c_site_users.find({ c_account: account._id })
    .paths('c_site')
    .skipAcl()
    .grant('read')
    .toArray()
    .map(siteUser => siteUser.c_site.toString())
  const c_site_access_list = account.c_site_access_list || []
  return sites.concat(c_site_access_list.map(siteId => siteId.toString()))
}

function manageUserSites({ accountId, sites, userSiteRoles, validationErrors, userAccountRoles, accountUpdateAttributes }) {
  sites = sites && sites.length ? sites : []
  userAccountRoles = userAccountRoles && userAccountRoles.length ? userAccountRoles : []
  sites = sites.map(siteId => siteId.toString())
  let numberOfSitesToProcess = 0
  const account = Account.find({ _id: accountId })
    .skipAcl()
    .grant('read')
    .include('c_site_access_list')
    .next()
  if (isNewPermissionModel || userAccountRoles.includes(consts.roles['EC Document Manager'] && consts.roles['EC Document Manager'].toString())) {
    const c_site_access_list = account.c_site_access_list && account.c_site_access_list.length ? account.c_site_access_list : []
    const currentSites = c_site_access_list.map(siteId => siteId.toString())
    const sitesToAssign = difference(sites, currentSites)
    const sitesToUnassign = difference(currentSites, sites)
    manageSitesInNewPermissionModel({ accountId, sitesToAssign, sitesToUnassign })
    numberOfSitesToProcess = sitesToAssign.length + sitesToUnassign.length
  }
  if (!isNewPermissionModel) {
    sites = userSiteRoles.length ? sites : []
    const roleTobeRemoved = []
    if (!userSiteRoles.length) {
      manageSitesInOldPermissionModelSingleUser({ accountId, sitesToAssign: [], sitesToUnassign: sites, roles: [], accountUpdateAttributes })
    } else {
      userSiteRoles.map(data => {
        const currentSites = c_site_users.find({ c_account: accountId, c_role: RoleNameMap[data] })
          .skipAcl()
          .grant('read')
          .toArray()
          .map((su) => su.c_site._id.toString())
        const sitesToUnassign = difference(currentSites, sites)
        const sitesToAssign = difference(sites, currentSites)
        numberOfSitesToProcess = numberOfSitesToProcess + sitesToUnassign.length + sitesToAssign.length
        return manageSitesInOldPermissionModelSingleUser({ accountId, sitesToAssign, sitesToUnassign, roles: [data] })
      })
      const nossignedSiteRoles = difference(OldSiteRoles, userSiteRoles)
      if (nossignedSiteRoles.length) {
        manageSitesInOldPermissionModelSingleUser({ accountId, sitesToAssign: [], sitesToUnassign: sites, roles: nossignedSiteRoles })
      }
      numberOfSitesToProcess = numberOfSitesToProcess + sites.length
    }

  }
  return numberOfSitesToProcess
}

function getExistingAccounts(accountsToProvision) {
  const emailList = [],
        userNameList = []
  accountsToProvision.forEach(account => {
    if (account.email) {
      emailList.push(account.email)
    }
    if (account.username) {
      userNameList.push(account.username)
    }
  })

  const accountsAlreadyCreated = Account.find({ $or: [{ email: { $in: emailList } }, { username: { $in: userNameList } }] })
    .paths('roles', 'email', 'state', 'username', 'c_site_access_list', 'loginMethods')
    .passive()
    .skipAcl()
    .grant('read')
    .toArray()

  const accountsMap = {}
  for (const account of accountsAlreadyCreated) {
    if (account.email) {
      accountsMap[account.email] = account
    } else {
      accountsMap[account.username] = account
    }

  }
  return accountsMap
}

function validateAccountIdentifier({ accountToProvision, validationErrors, existingAccounts }) {
  if (!accountToProvision.email && !accountToProvision.username) {
    addValidationError(accountToProvision, validationErrors, ValidationErrors.USERNAME_OR_EMAIL_REQUIRED)
  }

  if (accountToProvision.username) {
    validateUsername(accountToProvision, validationErrors)
  }

  if (accountToProvision.email && accountToProvision.username) {
    const accountMatchingEmail = existingAccounts[accountToProvision.email]
    const accountMatchingUsername = existingAccounts[accountToProvision.username]
    if (accountMatchingEmail && accountMatchingEmail.username !== accountToProvision.username) {
      addValidationError(accountToProvision, validationErrors, ValidationErrors.USERNAME_EMAIL_MISMATCH)
    } else if (accountMatchingUsername && accountMatchingUsername.email !== accountToProvision.email) {
      addValidationError(accountToProvision, validationErrors, ValidationErrors.USERNAME_EMAIL_MISMATCH)
    }
  }
}

function validateUsername(accountToProvision, validationErrors) {
  if (UtilsLibrary.isEmail(accountToProvision.username)) {
    addValidationError(accountToProvision, validationErrors, ValidationErrors.USERNAME_CANT_BE_EMAIL)
  } else if (!validateUsernameMatchesPattern(accountToProvision.username)) {
    addValidationError(accountToProvision, validationErrors, ValidationErrors.USERNAME_PATTERN_MISMATCH)
  }
}

function validateRolesFormat({ accountToProvision, validationErrors }) {
  if (accountToProvision.roles && accountToProvision.roles.length && accountToProvision.roles.filter(role => !AllRoles.includes(role)).length) {
    return addValidationError(accountToProvision, validationErrors, ValidationErrors.INVALID_ROLE)
  }
}

function validateSitesFormat({ accountToProvision, validationErrors }) {
  if (!accountToProvision.sites || !accountToProvision.sites.length || accountToProvision.sites.filter(site => !AllSites.includes(site.toString())).length) {
    addValidationError(accountToProvision, validationErrors, ValidationErrors.INVALID_SITE)
  }
}

function validatePermissionToAddRoles({ accountToProvision, validationErrors }) {
  if (isUserAndSiteManager() && accountToProvision.roles && accountToProvision.roles.length && accountToProvision.roles.filter(role => RoleIdsNotAccessibleToUSMUser.includes(role)).length) {
    return addValidationError(accountToProvision, validationErrors, ValidationErrors.NOT_ENOUGH_PERMISSION_TO_ADD_ROLE)
  }
}

function mergeExistingSites({ accountToProvision, existingAccount }) {
  accountToProvision.sites = accountToProvision.sites && accountToProvision.sites.length ? accountToProvision.sites : []
  const alreadyAssignedSiteToExisitingAccount = []
  if (existingAccount.c_site_access_list && existingAccount.c_site_access_list.length) {
    alreadyAssignedSiteToExisitingAccount.push(...existingAccount.c_site_access_list.map(site => site.toString()))
  }
  const siteIds = org.objects.c_site_users.find({ c_account: existingAccount._id })
    .paths('c_site._id')
    .skipAcl()
    .grant('read')
    .toArray()
    .map(data => data.c_site._id.toString())
  if (siteIds && siteIds.length) {
    alreadyAssignedSiteToExisitingAccount.push(...siteIds)
  }
  accountToProvision.sites.push(...alreadyAssignedSiteToExisitingAccount)
  accountToProvision.sites = uniq(accountToProvision.sites)
}

function validateRoleCombinationIsValid({ accountToProvision, validationErrors, siteRoles }) {
  if (skipValidation()) {
    return
  }
  /*
    Since "AccountRolesAssignableToSiteUsers" can be assigned to users having site level role as well as account level role,
    we remove these roles from the incoming role list, to determine if the result set has a mix of account level role and site level role
  */
  const rolesThatDetermineAccountType = difference(accountToProvision.roles, AccountRolesAssignableToSiteUsers)
  const siteRolesInNewRolesList = rolesThatDetermineAccountType.filter(role => siteRoles.includes(role))
  /*
        if ALL roles being assigned are site role or NONE of them are, its not an error.
        belo
      */
  if (!(siteRolesInNewRolesList.length === rolesThatDetermineAccountType.length) && !(siteRolesInNewRolesList.length === 0)) {
    addValidationError(accountToProvision, validationErrors, ValidationErrors.SITE_AND_ACCOUNT_ROLE_MIXED)
  }
}

function validateNewRolesCanBeAssignedToExistingUser({ isSiteUser, accountToProvision, existingAccount, siteRoles, validationErrors }) {
  if (skipValidation()) {
    return
  }
  const existingAccountRoles = existingAccount.roles.filter(role => !AccountRolesAssignableToSiteUsers.includes(role.toString()))
  const rolesThatDetermineAccountType = difference(accountToProvision.roles, SharedRoles)
  if (isSiteUser) {
    if (rolesThatDetermineAccountType.find(role => !siteRoles.concat(...EconsentSiteRoles)
      .includes(role))) {
      addValidationError(accountToProvision, validationErrors, ValidationErrors.NO_ACCOUNT_ROLE_TO_SITE_ROLE)
    }
  } else if (existingAccountRoles.length !== 0) {
    if (rolesThatDetermineAccountType.find(role => siteRoles.concat(...EconsentSiteRoles)
      .includes(role.toString()))) {
      addValidationError(accountToProvision, validationErrors, ValidationErrors.NO_SITE_ROLE_TO_ACCOUNT_ROLE)
    }
  }
}

function isThisSiteUser(existingAccount, siteRoles) {
  let isSiteUser = false
  if (!existingAccount) {
    return isSiteUser
  }
  if (isNewPermissionModel) {
    isSiteUser = existingAccount.roles.some(role => siteRoles.concat(...EconsentSiteRoles)
      .includes(role.toString()))
  } else {
    isSiteUser = c_site_users.find({ c_account: existingAccount._id })
      .skipAcl()
      .grant('read')
      .hasNext()
    if (!isSiteUser) {
      isSiteUser = existingAccount.roles.some(role => siteRoles.concat(...EconsentSiteRoles)
        .includes(role.toString()))
    }
  }
  return isSiteUser
}

function addValidationError(accountToProvision, validationErrors, newError, throwException = true) {
  if (!validationErrors[accountToProvision._index]) {
    validationErrors[accountToProvision._index] = []
  }
  validationErrors[accountToProvision._index].push(newError)
  if (throwException) throw (ValidationFailedException)
}

function dryRunBulkInsertForValidation({ preparedPayload: accountList, validationErrors }) {
  const docsToBeInserted = accountList.map(account => {
    return {
      usm__payload: omitBy({
        usm__index: account._index,
        usm__email: account.email,
        usm__username: account.username,
        usm__roles: account.roles,
        usm__sites: account.sites,
        usm__timeZone: account.timeZone,
        usm__mobile: account.mobile,
        usm__firstName: account.firstName,
        usm__lastName: account.lastName,
        usm__loginMethods: account.loginMethods
      }, isNil)
    }
  })
  /*
    We try to insert only 100 at a time because 100 is the default limit for max inserts in one call
  */
  for (const documentBatch of chunk(docsToBeInserted, 100)) {
    const { writeErrors } = usm__bulk_request.insertMany(documentBatch)
      .skipAcl()
      .grant('script')
      .dryRun(true)
      .execute()

    if (writeErrors.length) {
      for (const error of writeErrors) {
        const accountIndexInPayload = documentBatch[error.index].usm__payload.usm__index
        validationErrors[accountIndexInPayload] = error.faults.map(fault => {
          const errorMap = {}
          const faultPath = fault.path.split('.')
          // path is of the form "usm__bulk_request.usm__payload[].usm__email", we want just "email"
          errorMap[faultPath[faultPath.length - 1].replace('usm__', '')] = fault.message
          return errorMap
        })
      }
    }
  }
  return validationErrors
}

function preparePayloadForValidation({ accountsToProvision, validationErrors }) {
  /*
    This method will do basic cleanup and add identifier to payload to correlate error with the exact row
    Also handles duplicate data by merging if 2 rows are same, or raising error if there is data discrepancy
    for same account identifier
  */
  const preparedAccounts = []
  const uniqueAccountMap = {}

  for (let i = 0; i < accountsToProvision.length; i++) {
    let mismatch = false
    const accountEmail = accountsToProvision[i].email || ''
    const accountUsername = accountsToProvision[i].username || ''
    // ideally only 1 row should exist with a given unique identifier
    const rowIdentifier = `${accountEmail.toLowerCase()}-${accountUsername}`
    if (uniqueAccountMap[rowIdentifier]) {
      if (isEqual(uniqueAccountMap[rowIdentifier], accountsToProvision[i])) {
        continue
      } else {
        mismatch = true
      }
    } else {
      uniqueAccountMap[rowIdentifier] = accountsToProvision[i]
    }

    const account = { ...accountsToProvision[i], _index: i }
    if (account.email && account.email.length) {
      account.email = account.email.toLowerCase()
    }

    preparedAccounts.push(account)
    if (mismatch) {
      addValidationError(account, validationErrors, ValidationErrors.INPUT_DATA_DISCREPANCY, false)
    }
  }
  return preparedAccounts
}

function validateRequiredFieldsArePresent({ accountToProvision, validationErrors }) {
  if (AccountConfiguration.requireEmail && !accountToProvision.email) {
    addValidationError(accountToProvision, validationErrors, ValidationErrors.EMAIL_REQUIRED, false)
  }
  if (AccountConfiguration.requireUsername && !accountToProvision.username) {
    addValidationError(accountToProvision, validationErrors, ValidationErrors.USERNAME_REQUIRED, false)
  }

  if (AccountConfiguration.requireMobile && !accountToProvision.mobile) {
    addValidationError(accountToProvision, validationErrors, ValidationErrors.MOBILE_REQUIRED, false)
  }
}

function formatResponse(accountsToProvision = [], existingAccounts = {}, validationErrors = {}) {
  const response = { data: [], totalErrors: 0, totalNotes: 0, errorList: [] }
  let siteIdList = []
  let roleIdList = []
  for (const account of accountsToProvision) {
    let existingAccount
    const rowIdentifier = account._index
    const errorMessages = []
    const errors = validationErrors[rowIdentifier] || []
    // for bulk requests, for now we are only showing error values and not keys to retain previous behaviour
    errors.forEach(errorHash => errorMessages.push(...Object.values(errorHash)))
    /*
      we can correlate the request account to an existing account, only if there is no discrepancy in the username and email
    */
    if (!errorMessages.includes(ValidationErrors.USERNAME_EMAIL_MISMATCH)) {
      existingAccount = existingAccounts[account.email] || existingAccounts[account.username]
    }

    let currentStatus = existingAccount && existingAccount.state ? existingAccount.state : ''
    currentStatus = currentStatus.toLowerCase() === 'verified' ? 'Active' : currentStatus
    const status = existingAccount ? currentStatus : 'New'

    const existingRoles = existingAccount ? existingAccount.roles : []
    const sites = account.sites || []
    const oldLoginMethods = existingAccount ? existingAccount.loginMethods : []
    if (existingAccount && !isNewPermissionModel) {
      const oldSuRoles = c_site_users.find({ c_account: existingAccount._id })
        .paths('c_role')
        .skipAcl()
        .grant('read')
        .toArray()
        .map(su => consts.roles[su.c_role])
      if (oldSuRoles.length) {
        existingRoles.push(...uniq(oldSuRoles))
      }
    }
    const error = errorMessages.length > 0
    if (error) {
      response.totalErrors += 1
      response.totalNotes += 1
      response.errorList.push(...errorMessages)
    }
    const newRoles = difference(account.roles, existingRoles)
    const newRoleNames = Object.values(pick(RoleNameMap, newRoles))
    const existingRoleNames = Object.values(pick(RoleNameMap, existingRoles))
    const newLoginMethods = account.loginMethods || []
    siteIdList = uniq(siteIdList.concat(sites))
    roleIdList = uniq(roleIdList.concat(account.roles))
    if (currentStatus === 'Active' && !error && existingRoles.length && newRoles.length) {
      response.totalNotes += 1
      const siteRoles = getSiteRoles()
      const isSiteUser = existingRoles.filter(role => siteRoles.concat(...EconsentSiteRoles)
        .includes(role.toString()))
      const warnMessage = isSiteUser.length ? Object.values(ValidationErrors.WARN_EXISTING_SITE_USER_UPDATE) : Object.values(ValidationErrors.WARN_EXISTING_USER_UPDATE)
      errorMessages.push(...warnMessage)
    }
    let accountValidationResult = { ...account, sites, status, error, errorMessages, newRoles, newRoleNames, existingRoles, existingRoleNames }
    if (LoginMethodsUpdateAllowed) {
      accountValidationResult = { ...accountValidationResult, oldLoginMethods, newLoginMethods }
    }
    response.data.push(accountValidationResult)
  }
  response.siteInfoList = c_site.find({ _id: { $in: siteIdList.filter(siteId => id.isIdFormat(siteId)) } })
    .paths('c_number', 'c_name')
    .skipAcl()
    .grant('read')
    .map(site => {
      return {
        c_number: site.c_number,
        c_name: site.c_name
      }
    })
  response.siteIds = siteIdList.filter(siteId => id.isIdFormat(siteId))
  response.roleIds = roleIdList
  response.roleNameList = Object.values(pick(RoleNameMap, roleIdList))
  return response
}

function getClietWaitTime(numberOfSitesToProcess) {
  if (numberOfSitesToProcess <= 100) {
    return 5 * 1000
  } else if (numberOfSitesToProcess > 100 && numberOfSitesToProcess <= 200) {
    return 20 * 1000
  } else if (numberOfSitesToProcess > 200 && numberOfSitesToProcess <= 300) {
    return 30 * 1000
  }
  return 50 * 1000
}