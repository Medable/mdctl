import _ from 'lodash'
import { id } from 'util'
import logger from 'logger'

import { UtilsLibrary, getSiteRoles, EconsentSiteRoles, AccountRolesAssignableToSiteUsers, SharedRoles, checkAdminUser, NewSiteRoles, OldSiteRoles, ExcludeRoleToAssign, LoginMethodsUpdateAllowed, isUserAndSiteManager } from 'usm__utils_lib'
import { AccountConfiguration, validateUsernameMatchesPattern } from 'usm__validation_utils_lib'

const { c_site, usm__bulk_request, account: Account, org: OrgObject } = org.objects
const ValidationFailedException = 'ValidationFailedException'
const RolesWithMandatoryName = [
  'Data Manager',
  'Site User',
  'Site Monitor',
  'Site Investigator',
  'Study Manager App',
  'Axon Site User',
  'Axon Site Monitor',
  'Axon Site Investigator',
  'EC Document Manager'
]

class BulkUserProcessor {

  constructor(bulkAccounts) {
    this.validationErrors = {}
    this.setupDefaultResponseFields()
    this.orgData = OrgObject.find()
      .paths('roles._id', 'roles.name', 'creator', 'configuration.loginMethods')
      .next()
    this.siteRoles = getSiteRoles()
    this.isNewPermissionModel = UtilsLibrary.isNewPermissionModel()
    this.siteRolesIncludingEconsent = this.siteRoles.concat(...EconsentSiteRoles)
    this.accountsToProcess = this.sanitizeAccounts(bulkAccounts)
  }

  queryAndProcessAdditionalInformation() {
    this.getExistingAccounts()
    this.getAllSites()
    this.getAllRoles()
    this.getExistingSitesAndSiteRolesPerUser()
    this.getAllAccountsWithUsernames()
  }

  validatePayload({ mergeExistingData = true } = {}) {
    this.dryRunBulkInsertForValidation()
    this.validatedAccounts = this.accountsToProcess.map(account => {
      // all fields coming in account payload by default need to be returned in response
      this.addToValidationResponseFields(Object.keys(account))
      try {
        this.validateEmailPresence(account)
        const existingAccount = this.accountsMap[account.email]
        if (!existingAccount) {
          this.validateRequiredFieldsArePresent(account)
        }

        if (account.username) {
          this.validateUsername(account)
          this.validateUsernameAndEmailBelongToSameAccount(account)
        }

        if (account.loginMethods) {
          this.validateLoginMethods(account)
        }

        if (account.roles) {
          account.roles = this.getValidRoleIdsFromRoleNames(account)
          this.validatePermissionToModifyRoles(account, mergeExistingData)
          if (account.roles.length) {
            this.validateNewRolesAreMixOfSiteAndAccountLevel(account)
            if (existingAccount && mergeExistingData) {
              this.validateNewRolesAreCompatibleWithExistingRoles(account)
            }
          }
        }

        if (account.sites) {
          account.sites = this.getValidSiteIdsFromSiteNumber(account)
        }

        if (existingAccount) {
          if (mergeExistingData) {
            account = this.mergeDataFromExistingAccount(account)
          } else {
            if (account.sites) {
              account.sitesToUnassign = _.difference(existingAccount.sites, account.sites)
            }
            if (account.roles) {
              account.rolesToUnassign = _.difference(existingAccount.roles, account.roles)
            }
          }
        }

        this.validateSiteUser(account)

      } catch (e) {
        logger.error('error occurred', JSON.stringify(e))
      }
      return account
    })
  }

  getValidationResponseFields() {
    return Array.from(this.validationResponseFields)
      .sort()
  }

  setupDefaultResponseFields() {
    this.validationResponseFields = new Set(['email', 'firstName', 'lastName', 'roles', 'sites'])
    if (LoginMethodsUpdateAllowed) {
      this.validationResponseFields.add('loginMethods')
    }
  }

  addToValidationResponseFields(headers) {
    for (const header of headers) {
      this.validationResponseFields.add(header)
    }
  }

  mergeDataFromExistingAccount(account) {
    const existingAccount = this.accountsMap[account.email]
    const existingAccountDetails = _.pick(existingAccount, ['firstName', 'lastName', 'mobile', 'locked', 'loginMethods', 'tz', 'username'])
    const mergedData = { ...existingAccountDetails, ...account }
    mergedData.sites = _.uniq([...(account.sites || []), ...existingAccount.sites])
    mergedData.roles = _.uniq([...(account.roles || []), ...existingAccount.roles])
    return mergedData
  }

  validateSiteUser(account) {
    const isSiteUser = account.roles && account.roles.length > 0 && this.checkIfSiteRolesPresent(account.roles)
    const sitesPresent = account.sites && account.sites.length > 0
    if (isSiteUser && !sitesPresent) {
      this.addValidationError(account, { sites: 'SITE_ROLE_BUT_NO_SITE' })
    } else if (!isSiteUser && sitesPresent) {
      this.addValidationError(account, { roles: 'SITE_BUT_NO_ROLE' })
    }
  }

  formatResponse() {
    const fieldNamesForAccount = this.getValidationResponseFields()
    const fieldNamesForExistingAccount = fieldNamesForAccount.concat('_id')

    return this.validatedAccounts.map(account => {
      const accountResponse = _.pick(account, fieldNamesForAccount)
      if (accountResponse.roles) {
        accountResponse.roles = accountResponse.roles.map(role => this.roleIdToName[role])
      }
      if (accountResponse.sites) {
        accountResponse.sites = accountResponse.sites.map(site => this.siteIdToNumber[site])
      }

      const existingAccountDetails = this.accountsMap[accountResponse.email]
      if (existingAccountDetails) {
        existingAccountDetails.roles = (existingAccountDetails.roles || []).map(roleId => this.roleIdToName[roleId])
        existingAccountDetails.sites = (existingAccountDetails.sites || []).map(siteId => this.siteIdToNumber[siteId])
      }

      return {
        isExistingAccount: !!existingAccountDetails,
        account: accountResponse,
        existingAccountDetails: _.pick(existingAccountDetails, fieldNamesForExistingAccount),
        errors: this.validationErrors[accountResponse.email]
      }
    })
  }

  getValidRoleIdsFromRoleNames({ email, roles: roleNames }) {
    const roleIds = []
    const invalidRoleNames = []
    for (const roleName of roleNames) {
      const roleId = this.roleNameToId[roleName]
      if (!roleId) {
        invalidRoleNames.push(roleName)
      } else {
        roleIds.push(roleId)
      }
    }
    if (invalidRoleNames.length) {
      this.addValidationError({ email }, { roles: 'INVALID_ROLE' }, invalidRoleNames)
    }

    return roleIds
  }

  validatePermissionToModifyRoles({ email, roles }, mergeExistingData) {
    const existingAccount = this.accountsMap[email]
    const rolesAdded = existingAccount ? _.difference(roles, existingAccount.roles) : roles
    // if mergeExistingData is true, we are not removing any role
    const rolesRemoved = existingAccount && !mergeExistingData ? _.difference(existingAccount.roles, roles) : []
    const modifiedRoles = [...rolesAdded, ...rolesRemoved]
    const isCurrentUserAdmin = checkAdminUser()
    const isCurrentUserUserAndSiteManager = isUserAndSiteManager()
    const isDeveloperRoleModified = id.inIdArray(modifiedRoles, consts.roles.Developer)
    const isAdminRoleModified = id.inIdArray(modifiedRoles, consts.roles.Administrator)
    const isSupportRoleModified = id.inIdArray(modifiedRoles, consts.roles.Support)
    if (!isCurrentUserAdmin) {
      // Admin's access roles includes Developer and Support, so Admin is able to modify those roles

      if (isAdminRoleModified) {
        this.addValidationError({ email }, { roles: 'NOT_ENOUGH_PERMISSION_TO_MODIFY_ROLE' }, ['Administrator'])
      } else if (isDeveloperRoleModified) {
        this.addValidationError({ email }, { roles: 'NOT_ENOUGH_PERMISSION_TO_MODIFY_ROLE' }, ['Developer'])
      } else if (isCurrentUserUserAndSiteManager && isSupportRoleModified) {
        this.addValidationError({ email }, { roles: 'NOT_ENOUGH_PERMISSION_TO_MODIFY_ROLE' }, ['Support'])
      }
    } else if (existingAccount && isAdminRoleModified) {
      if (id.equalIds(script.principal._id, existingAccount._id)) {
        this.addValidationError({ email }, { roles: 'ADMIN_CANNOT_REMOVE_OWN_ADMIN_ROLE' }, ['Administrator'])
      } else if (id.equalIds(this.orgData.creator._id, existingAccount._id)) {
        this.addValidationError({ email }, { roles: 'ADMIN_CANNOT_REMOVE_ORG_ROOT_ACCOUNT_ADMIN_ROLE' }, ['Administrator'])
      }
    }
  }

  getValidSiteIdsFromSiteNumber({ email, sites: siteNumbers }) {
    const invalidSiteNumbers = []
    const siteIds = []
    for (const siteNumber of siteNumbers) {
      const siteId = this.siteNumberToId[siteNumber]
      if (!siteId) {
        invalidSiteNumbers.push(siteNumber)
      } else {
        siteIds.push(siteId)
      }
    }
    if (invalidSiteNumbers.length) {
      this.addValidationError({ email }, { sites: 'INVALID_SITE' }, invalidSiteNumbers)
    }

    return siteIds
  }

  validateNewRolesAreMixOfSiteAndAccountLevel(account) {
    const rolesThatDetermineAccountType = _.difference(account.roles, SharedRoles)
    const siteRolesExist = rolesThatDetermineAccountType.some(role => this.siteRolesIncludingEconsent.includes(role))
    const accountRolesExist = rolesThatDetermineAccountType.some(role => !this.siteRolesIncludingEconsent.includes(role))
    if (siteRolesExist && accountRolesExist) {
      this.addValidationError(
        account,
        { roles: 'SITE_AND_ACCOUNT_ROLE_MIXED' },
        account.roles.map(roleId => this.roleIdToName[roleId])
      )
    }
  }

  validateNewRolesAreCompatibleWithExistingRoles({ email, roles: newRoles }) {
    if (!newRoles.length) {
      return
    }
    const existingRoles = this.accountsMap[email].roles
    const existingAccountRoles = existingRoles.filter(role => !AccountRolesAssignableToSiteUsers.includes(role))
    const newRolesThatDetermineAccountType = _.difference(newRoles, SharedRoles)

    const isSiteUser = this.checkIfSiteRolesPresent(existingRoles)
    if (isSiteUser) {
      if (newRolesThatDetermineAccountType.find(role => !this.siteRolesIncludingEconsent.includes(role))) {
        this.addValidationError({ email }, { roles: 'NO_ACCOUNT_ROLE_TO_SITE_ROLE' }, newRoles.map(roleId => this.roleIdToName[roleId]))
      }
    } else if (existingAccountRoles.length !== 0) {
      if (newRolesThatDetermineAccountType.find(role => this.siteRolesIncludingEconsent.includes(role))) {
        this.addValidationError({ email }, { roles: 'NO_SITE_ROLE_TO_ACCOUNT_ROLE' }, newRoles.map(roleId => this.roleIdToName[roleId]))
      }

    }
  }

  validateEmailPresence(account) {
    /*
      TODO: this can also be done from the dryRunBulkInsert method by making email mandatory in that object
      but that would affect behavior of v1 api, so leaving it as is
    */
    if (!account.email) {
      this.addValidationError(account, { email: 'EMAIL_REQUIRED' })
    }
  }

  validateUsername(accountToProvision) {
    if (UtilsLibrary.isEmail(accountToProvision.username)) {
      this.addValidationError(accountToProvision, { username: 'USERNAME_CANT_BE_EMAIL' })
    } else if (!validateUsernameMatchesPattern(accountToProvision.username)) {
      this.addValidationError(accountToProvision, { username: 'USERNAME_PATTERN_MISMATCH' })
    }
  }

  validateUsernameAndEmailBelongToSameAccount(account) {
    const emailAssociatedWithUsername = this.accountUsernameToEmail[account.username]

    if (emailAssociatedWithUsername && account.email !== emailAssociatedWithUsername) {
      this.addValidationError(account, { username: 'USERNAME_EMAIL_MISMATCH' })
    }
  }

  validateRequiredFieldsArePresent(accountToProvision) {
    if (AccountConfiguration.requireUsername && !accountToProvision.username) {
      this.addValidationError(accountToProvision, { username: 'USERNAME_REQUIRED' })
    }

    if (AccountConfiguration.requireMobile && !accountToProvision.mobile) {
      this.addValidationError(accountToProvision, { mobile: 'MOBILE_REQUIRED' })
    }

    if (accountToProvision.roles && accountToProvision.roles.some(roleName => RolesWithMandatoryName.includes(roleName))) {
      if (!accountToProvision.firstName) {
        this.addValidationError(accountToProvision, { firstName: 'FIRST_NAME_REQUIRED' })
      }
      if (!accountToProvision.lastName) {
        this.addValidationError(accountToProvision, { lastName: 'LAST_NAME_REQUIRED' })
      }
    }
  }

  validateLoginMethods(account) {
    // login methods other than sso, credential are invalid and have been added as error during dry run
    const orgLoginMethods = this.orgData.configuration.loginMethods
    const loginMethods = account.loginMethods.filter(loginMethod => ['sso', 'credentials'].includes(loginMethod))
    const unavailableLoginMethods = loginMethods.filter(loginMethod => {
      return !orgLoginMethods.includes(loginMethod)
    })
    if (unavailableLoginMethods.length) {
      this.addValidationError({ email: account.email }, { loginMethods: 'LOGIN_METHOD_NOT_CONFIGURED' }, unavailableLoginMethods)
    }
  }

  addValidationError({ email }, error, context, throwException = false) {
    if (!this.validationErrors[email]) {
      this.validationErrors[email] = []
    }
    this.addToValidationResponseFields(Object.keys(error))

    this.validationErrors[email].push({ ...error, context: (context && context.join(',')) })
    if (throwException) {
      throw ValidationFailedException
    }
  }

  checkIfSiteRolesPresent(roles) {
    if (!roles) {
      return false
    }
    return roles.some(role => this.siteRolesIncludingEconsent.includes(role.toString()))
  }

  getExistingAccounts() {
    const accountEmails = this.accountsToProcess.map(account => account.email)
    const existingAccounts = Account.find({ email: { $in: accountEmails } })
      .paths('roles', 'email', 'c_site_access_list', 'name', 'mobile', 'locked', 'loginMethods', 'tz', 'username')
      .passive()
      .skipAcl()
      .grant('read')
      .toArray()
    this.existingAccountIds = existingAccounts.map(account => account._id)
    this.accountsMap = {}
    this.accountIdToEmail = {}
    for (const account of existingAccounts) {
      const roles = account.roles.map(roleId => roleId.toString())
      const sites = (account.c_site_access_list || []).map(siteId => siteId.toString())
      let loginMethods = account.loginMethods
      if (!loginMethods.length && LoginMethodsUpdateAllowed) {
        loginMethods = ['sso', 'credentials']
      }
      const firstName = account.name.first
      const lastName = account.name.last
      this.accountsMap[account.email] = _.omit(
        { ...account, roles, sites, firstName, lastName, loginMethods },
        ['c_site_access_list', 'object', 'name']
      )
      this.accountIdToEmail[account._id] = account.email
    }
  }

  getExistingSitesAndSiteRolesPerUser() {
    for (const existingAccountChunk of _.chunk(this.existingAccountIds, 50)) {
      const accountSitesAggregation = org.objects.c_site_users.aggregate()
        .skipAcl()
        .grant('read')
        .match({ c_account: { $in: existingAccountChunk } })
        .project({ c_account: 1, c_site: 1, c_role: 1 })
        .group({ _id: 'c_account._id', sites: { $addToSet: 'c_site._id' }, roles: { $addToSet: 'c_role' } })
        .toArray()

      accountSitesAggregation.forEach(account => {
        const accountEmail = this.accountIdToEmail[account._id]
        const existingAccount = this.accountsMap[accountEmail]
        existingAccount.sites = _.uniq([...existingAccount.sites, ...account.sites].map(siteId => siteId.toString()))
        const oldSiteRoles = account.roles.map(roleName => this.roleNameToId[roleName])
        existingAccount.roles = _.uniq([...existingAccount.roles, ...oldSiteRoles].map(roleId => roleId.toString()))
      })
    }

  }

  getAllSites() {
    const allSites = c_site.find()
      .skipAcl()
      .grant('read')
      .paths('_id', 'c_number')
      .toArray()
    this.siteNumberToId = _.mapValues(_.keyBy(allSites, 'c_number'), function(u) { return u._id.toString() })
    this.allSiteIds = new Set(Object.values(this.siteNumberToId))
    this.siteIdToNumber = _.invert(this.siteNumberToId)
  }

  getAllRoles() {
    let allRoles = this.orgData.roles
    const unassignableSiteRoles = this.isNewPermissionModel ? OldSiteRoles : NewSiteRoles
    const unassignableRoles = ExcludeRoleToAssign.concat(unassignableSiteRoles)
    allRoles = allRoles.filter(role => !unassignableRoles.includes(role._id.toString()))
    this.roleNameToId = _.mapValues(_.keyBy(allRoles, 'name'), function(u) { return u._id.toString() })
    this.roleIdToName = _.invert(this.roleNameToId)
  }

  getAllAccountsWithUsernames() {
    const accountsWithEmailAndUsername = Account.find({ username: { $exists: true }, email: { $exists: true } })
      .paths('username', 'email')
      .skipAcl()
      .grant('read')
      .toArray()
    this.accountUsernameToEmail = _.mapValues(_.keyBy(accountsWithEmailAndUsername, 'username'), function(u) { return u.email })
  }

  dryRunBulkInsertForValidation() {
    const docsToBeInserted = this.accountsToProcess.map(account => {
      return {
        usm__payload: _.omitBy({
          usm__email: account.email,
          usm__username: account.username,
          usm__tz: account.tz,
          usm__mobile: account.mobile,
          usm__firstName: account.firstName,
          usm__lastName: account.lastName,
          usm__loginMethods: account.loginMethods
        }, _.isNil)
      }
    })

    /*
    We try to insert only 100 at a time because 100 is the default limit for max inserts in one call
  */
    for (const documentBatch of _.chunk(docsToBeInserted, 100)) {
      const { writeErrors } = usm__bulk_request.insertMany(documentBatch)
        .skipAcl()
        .grant('script')
        .dryRun(true)
        .execute()

      if (writeErrors.length) {
        for (const error of writeErrors) {
          const email = documentBatch[error.index].usm__payload.usm__email
          error.faults.forEach(fault => {
            const errorMap = {}
            const faultPath = fault.path.split('.')
            // path is of the form "usm__bulk_request.usm__payload[].usm__email", we want just "email"
            // when property is an array, there is a [] at the end of property name, so we remove that as well
            const faultKey = faultPath[faultPath.length - 1].replace('usm__', '')
              .replace('[]', '')

            errorMap[faultKey] = `INVALID_${faultKey.toUpperCase()}`
            this.addValidationError({ email }, errorMap)
          })

        }
      }
    }
  }

  sanitizeAccounts(accounts) {
    const allowedPropertiesInAccount = ['email', 'firstName', 'lastName', 'mobile', 'locked', 'loginMethods', 'tz', 'username', 'roles', 'sites']
    const propertiesWithArrayValue = ['loginMethods', 'roles', 'sites']
    const falsyValuesForLockedProperty = ['false', '0', 0, false, null, undefined, '']

    return accounts.map(account => {
      account = _.pick(account, allowedPropertiesInAccount)
      const accountPropertiesInPayload = Object.keys(account)
      for (const prop in account) {
        // TODO: check if this condition can be removed
        if (!account[prop]) {
          continue
        }

        if (propertiesWithArrayValue.includes(prop)) {
          account[prop] = Array.isArray(account[prop]) ? account[prop] : Array(account[prop])
          account[prop] = _.uniq(account[prop].map(data => data.toString()
            .trim()))
        } else {
          account[prop] = account[prop].toString()
            .trim()
        }
      }
      if (accountPropertiesInPayload.includes('email')) {
        account.email = account.email.toLowerCase()
      }
      if (accountPropertiesInPayload.includes('loginMethods')) {
        account.loginMethods = account.loginMethods.map(loginMethod => loginMethod.toLowerCase())
      }
      if (accountPropertiesInPayload.includes('locked')) {
        const locked = typeof account.locked === 'string'
          ? account.locked.toLowerCase()
            .trim()
          : account.locked
        if (falsyValuesForLockedProperty.includes(locked)) {
          account.locked = false
        } else {
          account.locked = true
        }
      }
      return account
    })

  }

}

module.exports = {
  BulkUserProcessor
}