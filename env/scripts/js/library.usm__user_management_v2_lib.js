import { route, trigger, log } from 'decorators'
import logger from 'logger'
import _ from 'lodash'
import { BulkUserProcessor } from 'usm__bulk_accounts_processor'
export class UserManagementLibraryV2 {

  @route({
    method: 'POST',
    name: 'usm__v2_bulk_validate',
    path: 'usm/v2/validate_accounts',
    acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
  })
  static bulkUserValidation({ body }) {
    const { accounts, mergeExistingData } = body()
    const processor = new BulkUserProcessor(accounts)
    processor.queryAndProcessAdditionalInformation()
    processor.validatePayload({ mergeExistingData })
    return { accounts: processor.formatResponse(), fieldsToDisplay: processor.getValidationResponseFields() }
  }

  @route({
    method: 'POST',
    name: 'usm__v2_execute_bulk_accounts',
    path: 'usm/v2/execute_accounts',
    acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
  })
  static executeBulkUserRequest({ body }) {
    const { accounts } = body()
    const processor = new BulkUserProcessor(accounts)
    processor.queryAndProcessAdditionalInformation()
    processor.validatePayload({ mergeExistingData: false })
    const validationResult = processor.formatResponse()
    const validationErrorPresent = validationResult.some(account => !!account.errors)
    if (validationErrorPresent) {
      return { accounts: validationResult, statusCode: 400 }
    }
    const batches = []
    for (const accountsChunk of _.chunk(processor.validatedAccounts, 50)) {
      const batchItems = accountsChunk.map(account => {
        return _.omitBy({
          usm__email: account.email,
          usm__username: account.username,
          usm__tz: account.tz,
          usm__mobile: account.mobile,
          usm__firstName: account.firstName,
          usm__lastName: account.lastName,
          usm__loginMethods: account.loginMethods,
          usm__sites: account.sites,
          usm__sitesToUnassign: account.sitesToUnassign,
          usm__roles: account.roles,
          usm__rolesToUnassign: account.rolesToUnassign,
          usm__locked: account.locked
        }, _.isNil)
      })
      batches.push({ usm__items: batchItems })
    }

    const bulkRequestId = org.objects.usm__bulk_request.insertOne({ usm__batches: batches, usm__version: 'v2' })
      .bypassCreateAcl()
      .grant('script')
      .execute()

    return { status: 'done', referenceId: bulkRequestId }
  }

}