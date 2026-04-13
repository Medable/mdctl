import {
  trigger,
  log,
  on
} from 'decorators'
import logger from 'logger'
import moment from 'moment.timezone'
import _ from 'lodash'

import { UtilsLibrary, EconsentSiteRoles, getSiteRoles, segregateSiteAndAccountLevelRoles, manageSitesInNewPermissionModel, manageSitesInOldPermissionModel, provisionAccount } from 'usm__utils_lib'
const { Events, account: Account, usm__bulk_request } = org.objects
const isNewPermissionModel = UtilsLibrary.isNewPermissionModel()
const MaxRetryPerBatch = 50
const ActionEventMap = {
  create: 'usm__provision_batch_v2',
  assignSite: 'usm__batch_assign_site_v2'
}

export class BulkRequestExecutionLibV2 {

  @log({ traceError: true })
  @trigger('create.after', { object: 'usm__bulk_request' })
  static startProcessing({ new: newBulkRequest }) {
    if (newBulkRequest.usm__version !== 'v2') {
      return
    }
    findNextBatchAndStart(newBulkRequest._id)
  }

  @log({ traceError: true })
  @on('usm__provision_batch_v2', { name: 'usm__provision_batch_v2' })
  static provisionBatchV2({ initiator, bulkRequestId, batchId }) {
    const batch = usm__bulk_request.find({ _id: bulkRequestId })
      .paths(
        `usm__batches.${batchId}`
      )
      .skipAcl()
      .grant('read')
      .next().usm__batches[0]

    const accountsMap = getExistingAccounts(batch.usm__items)
    const allSiteRoles = getSiteRoles()
    const accountsToAssignSite = []

    batch.usm__items.forEach(({ usm__username, usm__email, usm__roles, usm__sites, usm__firstName, usm__lastName, usm__mobile, usm__tz, usm__loginMethods, usm__locked }) => {
      let account = accountsMap[usm__email]
      let userAccountRoles
      if (usm__roles) {
        const segregatedRoles = segregateSiteAndAccountLevelRoles(usm__roles, usm__sites, allSiteRoles)
        userAccountRoles = segregatedRoles.userAccountRoles
      }

      if (!account) {
        account = provisionAccount({ username: usm__username, email: usm__email, roles: userAccountRoles, name: { first: usm__firstName, last: usm__lastName }, mobile: usm__mobile, tz: usm__tz, loginMethods: usm__loginMethods })
        if (usm__locked !== undefined) {
          // Cortex isn't allowing updating "locked" attribute on creation, even with 'script' acl. So we update it separately
          const updateAttributes = { locked: usm__locked }
          updateAccount(account._id, updateAttributes)
        }
      } else {
        const updateAttributes = _.omitBy({ roles: userAccountRoles, mobile: usm__mobile, tz: usm__tz, username: usm__username, loginMethods: usm__loginMethods, locked: usm__locked }, _.isNil)
        updateAttributes.name = _.omitBy({ first: usm__firstName, last: usm__lastName }, _.isNil)
        updateAccount(account._id, updateAttributes)
      }

      if (usm__sites && usm__sites.length) {
        accountsToAssignSite.push({ usm__username, usm__email, usm__roles, usm__sites })
      }
    })
    if (accountsToAssignSite.length) {
      enqueueBatch({ bulkRequestId, batchId, initiator, eventName: 'usm__batch_assign_site_v2' })
    } else {
    // if control reached here, all items in this batch have been processed successfully
      updateBatchStatus(bulkRequestId, batchId, 'successful')
      findNextBatchAndStart(bulkRequestId)
    }
  }

  @log({ traceError: true })
  @on('usm__batch_assign_site_v2', { name: 'usm__batch_assign_site_v2' })
  static assignSitesV2({ initiator, bulkRequestId, batchId }) {
    const batch = usm__bulk_request.find({ _id: bulkRequestId })
      .paths(
        `usm__batches.${batchId}`
      )
      .skipAcl()
      .grant('read')
      .next().usm__batches[0]
    const allSiteRoles = getSiteRoles()
    const accountsMap = getExistingAccounts(batch.usm__items)

    batch.usm__items.forEach(({ usm__email, usm__roles, usm__sites, usm__sitesToUnassign, usm__rolesToUnassign }) => {
      const account = accountsMap[usm__email]
      const { userSiteRoles, userAccountRoles } = segregateSiteAndAccountLevelRoles(usm__roles, usm__sites, allSiteRoles)

      if (isNewPermissionModel || userAccountRoles.find(role => EconsentSiteRoles.includes(role))) {
        script.as(initiator, { principal: { grant: consts.accessLevels.script, skipAcl: true }, modules: { safe: false } }, () => {
          manageSitesInNewPermissionModel({ accountId: account._id, sitesToAssign: usm__sites, sitesToUnassign: usm__sitesToUnassign })
        })
      }

      if (!isNewPermissionModel && userSiteRoles.length) {
        script.as(initiator, { principal: { grant: consts.accessLevels.script, skipAcl: true }, modules: { safe: false } }, () => {
          manageSitesInOldPermissionModel({ accountId: account._id, sitesToAssign: usm__sites, sitesToUnassign: usm__sitesToUnassign, roles: userSiteRoles, rolesToUnassign: usm__rolesToUnassign })
        })
      }
    })
    updateBatchStatus(bulkRequestId, batchId, 'successful')
    findNextBatchAndStart(bulkRequestId)
  }

  @log({ traceError: true })
  @trigger('err.events.failed')
  handleErrorV2({ context: { event, key, param }, params: { err } }) {
    if (!Object.values(ActionEventMap)
      .includes(event)) {
      return
    }
    const message = `**** Error in Bulk request V2 upload handler Event: ${event} with key: ${key}`
    logger.error(message, err)
    const batch = usm__bulk_request.find({ _id: param.bulkRequestId })
      .skipAcl()
      .grant('read')
      .paths(`usm__batches.${param.batchId}`)
      .next()
      .usm__batches[0]

    const retryCount = batch.usm__retries || 0
    if (retryCount < MaxRetryPerBatch) {
      usm__bulk_request.updateOne({ _id: param.bulkRequestId }, { $set: { usm__batches: [{ _id: param.batchId, usm__retries: retryCount + 1 }] } })
        .skipAcl()
        .grant(consts.accessLevels.script)
        .execute()
      enqueueBatch({ bulkRequestId: param.bulkRequestId, batchId: param.batchId, initiator: param.initiator, retry: true, eventName: event })
    } else {
      updateBatchStatus(param.bulkRequestId, param.batchId, 'failed')
      findNextBatchAndStart(param.bulkRequestId)
    }
  }

}

function notifyParentAboutCompletion(bulkRequestId) {
  // completion could have happened successfully or failed, can be known from querying status of batches
  usm__bulk_request.updateOne({ _id: bulkRequestId }, { $set: { usm__status: 'completed' } })
    .skipAcl()
    .grant('update')
    .execute()
}

function enqueueBatch({ bulkRequestId, batchId, initiator, eventName, retry = false }) {
  const cortexEvent = {
    type: 'script',
    event: eventName,
    principal: initiator,
    key: `${eventName}-${batchId}-${Math.random()
      .toString(36)
      .substring(7)}`,
    param: {
      initiator,
      bulkRequestId,
      batchId
    }
  }
  if (retry) {
    cortexEvent.start = moment()
      .add(2, 'seconds')
      .toISOString()
  }
  Events.insertOne(cortexEvent)
    .bypassCreateAcl()
    .grant(consts.accessLevels.update)
    .execute()
}

function updateBatchStatus(bulkRequestId, batchId, newStatus) {
  usm__bulk_request.updateOne({ _id: bulkRequestId }, { $set: { usm__batches: [{ _id: batchId, usm__status: newStatus }] } })
    .skipAcl()
    .grant(consts.accessLevels.update)
    .execute()
}

function findNextBatchAndStart(bulkRequestId) {
  const bulkRequestObj = usm__bulk_request.find({ _id: bulkRequestId })
    .paths('usm__batches', 'creator')
    .skipAcl()
    .grant('read')
    .next()
  const firstPendingBatch = bulkRequestObj.usm__batches.find(batch => batch.usm__status === 'pending')
  if (!firstPendingBatch) {
    notifyParentAboutCompletion(bulkRequestId)
    return
  }
  enqueueBatch({ bulkRequestId, batchId: firstPendingBatch._id, initiator: bulkRequestObj.creator._id, eventName: 'usm__provision_batch_v2' })
}

function getExistingAccounts(accountsToProvision) {
  const emailList = accountsToProvision.map(account => account.usm__email)
  const accountsAlreadyCreated = Account.find({ email: { $in: emailList } })
    .paths('email')
    .skipAcl()
    .grant('read')
    .toArray()

  const accountsMap = {}
  for (const account of accountsAlreadyCreated) {
    accountsMap[account.email] = account
  }

  return accountsMap
}

function updateAccount(accountId, accountAttributes) {
  Account.updateOne(
    { _id: accountId },
    { $set: accountAttributes }
  )
    .skipAcl()
    .grant('script')
    .execute()
}