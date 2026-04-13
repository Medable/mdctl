import {
  trigger,
  log,
  on
} from 'decorators'
import logger from 'logger'
import moment from 'moment.timezone'

import { UtilsLibrary, EconsentSiteRoles, getSiteRoles, segregateSiteAndAccountLevelRoles, manageSitesInNewPermissionModel, manageSitesInOldPermissionModel, provisionAccount, LoginMethodsUpdateAllowed } from 'usm__utils_lib'
const { Events, account: Account, usm__bulk_request } = org.objects
const isNewPermissionModel = UtilsLibrary.isNewPermissionModel()
const MaxRetryPerBatch = 50
const ActionEventMap = {
  create: 'usm__provision_batch',
  lock: 'usm__batch_lock',
  unlock: 'usm__batch_unlock',
  resetPassword: 'usm__batch_resetPassword',
  assignSite: 'usm__batch_assign_site'
}

export class BulkRequestExecutionLib {

  @log({ traceError: true })
  @trigger('create.after', { object: 'usm__bulk_request' })
  static processBatches({ new: newBulkRequest }) {
    if (newBulkRequest.usm__version === 'v2') {
      return
    }
    if (newBulkRequest.usm__action === 'create') {
      const batchToProcessInSync = newBulkRequest.usm__batches.find(batch => batch.usm__type === 'sync')
      if (batchToProcessInSync) {
        try {
          this.provisionBatch({ batch: batchToProcessInSync._id, initiator: newBulkRequest.creator._id, bulkRequestId: newBulkRequest._id })
        } catch (err) {
          updateBatchStatus(newBulkRequest._id, batchToProcessInSync._id, 'failed')
        }
      }

      newBulkRequest.usm__batches.filter(batch => batch.usm__type === 'async')
        .forEach(batch => {
          enqueueBatch({ bulkRequestId: newBulkRequest._id, batch, initiator: newBulkRequest.creator._id, eventName: ActionEventMap.create })
        })
    } else {
      newBulkRequest.usm__batches
        .forEach(batch => {
          enqueueBatch({ bulkRequestId: newBulkRequest._id, batch, initiator: newBulkRequest.creator._id, eventName: ActionEventMap[newBulkRequest.usm__action] })
        })
    }

  }

  @log({ traceError: true })
  @on('usm__provision_batch', { name: 'usm__provision_batch' })
  static provisionBatch({ batch, initiator, bulkRequestId }) {
    batch = getBatch(batch, bulkRequestId)
    if (!canBatchBeExecuted(batch)) {
      return
    }
    const accountsMap = getExistingAccounts(batch.usm__items)
    const allSiteRoles = getSiteRoles()
    const accountsToAssignSite = []

    batch.usm__items.forEach(({ usm__username, usm__email, usm__roles, usm__sites, usm__firstName, usm__lastName, usm__mobile, usm__timeZone, usm__loginMethods }) => {
      let account = accountsMap[usm__email] || accountsMap[usm__username]
      const { userAccountRoles } = segregateSiteAndAccountLevelRoles(usm__roles, usm__sites, allSiteRoles)
      if (!account) {
        account = provisionAccount({ username: usm__username, email: usm__email, roles: userAccountRoles, name: { first: usm__firstName, last: usm__lastName }, mobile: usm__mobile, tz: usm__timeZone, loginMethods: usm__loginMethods })
      } else if (userAccountRoles.length) {
        updateRoles(account._id, userAccountRoles)
      }
      // this logic is specific to the case where account was already provisioned
      if (usm__loginMethods && (account.loginMethods !== usm__loginMethods)) {
        updateLoginMethods(account._id, usm__loginMethods)
      }

      if (usm__sites.length) {
        accountsToAssignSite.push({ usm__username, usm__email, usm__roles, usm__sites })
      }
    })
    if (accountsToAssignSite.length) {
      enqueueBatch({ bulkRequestId, batch: { _id: batch._id, usm__items: accountsToAssignSite }, initiator, eventName: 'usm__batch_assign_site' })
    } else {
    // if control reached here, all items in this batch have been processed successfully
      updateBatchStatus(bulkRequestId, batch._id, 'successful')
    }
  }

  @log({ traceError: true })
  @on('usm__batch_assign_site', { name: 'usm__batch_assign_site' })
  static assignSites({ batch, initiator, bulkRequestId }) {
    batch = getBatch(batch, bulkRequestId)
    const allSiteRoles = getSiteRoles()
    const accountsMap = getExistingAccounts(batch.usm__items)

    batch.usm__items.forEach(({ usm__username, usm__email, usm__roles, usm__sites }) => {
      const account = accountsMap[usm__email] || accountsMap[usm__username]
      const { userSiteRoles, userAccountRoles } = segregateSiteAndAccountLevelRoles(usm__roles, usm__sites, allSiteRoles)

      if (isNewPermissionModel || userAccountRoles.find(role => EconsentSiteRoles.includes(role))) {
        script.as(initiator, { principal: { grant: consts.accessLevels.script, skipAcl: true }, modules: { safe: false } }, () => {
          manageSitesInNewPermissionModel({ accountId: account._id, sitesToAssign: usm__sites })
        })
      }

      if (!isNewPermissionModel && userSiteRoles.length) {
        script.as(initiator, { principal: { grant: consts.accessLevels.script, skipAcl: true }, modules: { safe: false } }, () => {
          manageSitesInOldPermissionModel({ accountId: account._id, sitesToAssign: usm__sites, roles: userSiteRoles })

        })
      }
    })
    updateBatchStatus(bulkRequestId, batch._id, 'successful')
  }

  @log({ traceError: true })
  @on('usm__batch_lock', { name: 'usm__batch_lock' })
  static batchLock({ batch, initiator, bulkRequestId }) {
    batch = getBatch(batch, bulkRequestId)
    if (!canBatchBeExecuted(batch)) {
      return
    }

    const accountIds = batch.usm__items.map(({ usm__accountId }) => usm__accountId)
    Account.updateMany({ _id: { $in: accountIds } }, { $set: { locked: true } })
      .skipAcl()
      // script access added here because the property writeAccess is 'script'
      .grant('script')
      .execute()

    // if control reached here, all items in this batch have been processed successfully
    updateBatchStatus(bulkRequestId, batch._id, 'successful')
  }

  @log({ traceError: true })
  @on('usm__batch_unlock', { name: 'usm__batch_unlock' })
  static batchUnLock({ batch, initiator, bulkRequestId }) {
    batch = getBatch(batch, bulkRequestId)
    if (!canBatchBeExecuted(batch)) {
      return
    }

    const accountIds = batch.usm__items.map(({ usm__accountId }) => usm__accountId)
    Account.updateMany({ _id: { $in: accountIds } }, { $set: { locked: false } })
      .skipAcl()
      // script access added here because the property writeAccess is 'script'
      .grant('script')
      .execute()

    // if control reached here, all items in this batch have been processed successfully
    updateBatchStatus(bulkRequestId, batch._id, 'successful')
  }

  @log({ traceError: true })
  @on('usm__batch_resetPassword', { name: 'usm__batch_resetPassword' })
  static batchResetPassword({ batch, initiator, bulkRequestId }) {
    batch = getBatch(batch, bulkRequestId)
    if (!canBatchBeExecuted(batch)) {
      return
    }
    const bulkRequest = usm__bulk_request.find({ _id: bulkRequestId })
      .paths('created')
      .skipAcl()
      .grant('read')
      .next()
    const accountIds = batch.usm__items.map(({ usm__accountId }) => usm__accountId)
    const accounts = Account.find({ _id: { $in: accountIds } })
      .paths('stats.lastPasswordReset')
      .skipAcl()
      // update access added here because property readAccess is 'update'
      .grant('update')
      .toArray()
    /*
      only if last password reset was requested before bulk request time, we proceed to reset password
      so that we are not sending multiple emails in case of retry
    */
    for (const account of accounts) {
      const lastPasswordReset = account.stats.lastPasswordReset
      if (!lastPasswordReset || moment(lastPasswordReset)
        .isSameOrBefore(moment(bulkRequest.created))) {
        Account.createPasswordResetToken(account._id, { locale: account.locale || 'en_US', sendEmail: true, sendMobile: false })
      }
    }

    // if control reached here, all items in this batch have been processed successfully
    updateBatchStatus(bulkRequestId, batch._id, 'successful')
  }

  @log({ traceError: true })
  @trigger('err.events.failed')
  handleError({ context: { event, key, param }, params: { err } }) {
    if (!Object.values(ActionEventMap)
      .includes(event)) {
      return
    }
    const message = `Error in Cortex Event: ${event} with key: ${key}`
    param.batch = getBatch(param.batch, param.bulkRequestId)
    logger.error(message, err)
    const bulkRequest = usm__bulk_request.find({ _id: param.bulkRequestId })
      .skipAcl()
      .grant('read')
      .paths(`usm__batches.${param.batch._id}`)
      .next()
    const retryCount = bulkRequest.usm__batches[0].usm__retries || 0
    if (retryCount < MaxRetryPerBatch) {
      usm__bulk_request.updateOne({ _id: param.bulkRequestId }, { $set: { usm__batches: [{ _id: param.batch._id, usm__retries: retryCount + 1 }] } })
        .skipAcl()
        .grant(consts.accessLevels.script)
        .execute()
      enqueueBatch({ bulkRequestId: param.bulkRequestId, batch: param.batch, initiator: param.initiator, retry: true, eventName: event })
    } else {
      updateBatchStatus(param.bulkRequestId, param.batch._id, 'failed')
    }
  }

}

function canBatchBeExecuted({ usm__status }) {
  return !['successful', 'failed'].includes(usm__status)
}

function enqueueBatch({ bulkRequestId, batch, initiator, retry = false, eventName }) {
  const cortexEvent = {
    type: 'script',
    event: eventName,
    principal: initiator,
    key: `${eventName}-${bulkRequestId}-${batch._id}-${Math.random()
      .toString(36)
      .substring(7)}`,
    param: {
      batch: batch._id,
      initiator,
      bulkRequestId
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

function updateRoles(accountId, userAccountRoles) {
  Account.updateOne(
    { _id: accountId },
    { $push: { roles: userAccountRoles } }
  )
    .skipAcl()
    .grant('script')
    .execute()
}

function updateLoginMethods(accountId, loginMethods) {
  if (!LoginMethodsUpdateAllowed) {
    return
  }
  Account.updateOne(
    { _id: accountId },
    { $set: { loginMethods } }
  )
    .skipAcl()
    .grant('script')
    .execute()
}

function updateBatchStatus(bulkRequestId, batchId, newStatus) {
  usm__bulk_request.updateOne({ _id: bulkRequestId }, { $set: { usm__batches: { _id: batchId, usm__status: newStatus } } })
    .skipAcl()
    .grant(consts.accessLevels.update)
    .execute()
}

function getBatch(batchId, bulkRequestId) {
  const request = org.objects.usm__bulk_request.find({ _id: bulkRequestId })
    .skipAcl()
    .grant('read')
    .next()
  return request.usm__batches.find(batch => batch._id.toString() === batchId.toString())
}

function getExistingAccounts(accountsToProvision) {
  const emailList = [],
        userNameList = []
  accountsToProvision.forEach(account => {
    if (account.usm__email) {
      emailList.push(account.usm__email)
    } else {
      userNameList.push(account.usm__username)
    }
  })

  const accountsAlreadyCreated = Account.find({ $or: [{ email: { $in: emailList } }, { username: { $in: userNameList } }] })
    .paths('roles', 'username', 'email', 'loginMethods')
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