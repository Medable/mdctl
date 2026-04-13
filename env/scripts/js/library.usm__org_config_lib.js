import { route } from 'decorators'
import config from 'config'

export class OrgConfigLibrary {

  @route({
    method: 'GET',
    name: 'usm__org_apps',
    path: 'usm/org/apps',
    acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
  })
  static getApps() {
    return org.objects.org
      .find()
      .skipAcl()
      .grant('read')
      .paths('apps')
      .next()
      .apps
      .map(({ name, label }) => ({ name, label }))
  }

  @route({
    method: 'GET',
    name: 'usm__bulk_creation_limit',
    path: 'usm/bulk_creation_limit',
    acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
  })
  static getBulkCreationLimit() {
    const orgConfig = org.objects.org
      .find()
      .skipAcl()
      .grant('read')
      .paths('configuration')
      .next()

    const totalNoOfAccounts = org.objects.account
      .find()
      .skipAcl()
      .grant('read')
      .count()

    const maxAllowedAccounts = orgConfig.configuration && orgConfig.configuration.maxAccounts ? parseInt(orgConfig.configuration.maxAccounts) : 0

    const remainingNoOfAccounts = maxAllowedAccounts - parseInt(totalNoOfAccounts)

    const usmDefaultLimit = config.get('usm__configuration.maxItemsInBulkRequest') || 100

    const usmBulkCreationLimit = Math.min(remainingNoOfAccounts, usmDefaultLimit)

    const maxFileLimitData = (orgConfig.configuration && orgConfig.configuration.maxRequestSize) || ''
    const maxFileLimitType = maxFileLimitData.split(/[\W\d]+/)
      .join('')
      .toLowerCase()
    const maxFileLimit = parseInt(maxFileLimitData.split(/[^\d]+/)
      .join(''))

    return {
      max_bulk_creation_limit: usmBulkCreationLimit,
      max_allowed_accounts: maxAllowedAccounts,
      total_no_of_accounts: parseInt(totalNoOfAccounts),
      max_file_limit: { size: maxFileLimit || 0, type: maxFileLimitType || 'kb' }
    }
  }

  @route({
    method: 'GET',
    name: 'usm__org_account_config',
    path: 'usm/org_account_config',
    acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
  })
  static getAccountConfig() {
    return org.objects.org
      .find()
      .skipAcl()
      .grant('read')
      .paths('configuration.accounts')
      .next()
  }

}