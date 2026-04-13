/* eslint-disable no-case-declarations */
/* eslint-disable no-undef */
import nucUtils from 'c_nucleus_utils'

const cache = require('cache')
const logger = require('logger')
const { createOperation } = require('db')
const { run: runExpression } = require('expressions')
const _ = require('lodash')
const { getSqlQueryStatus } = require('c_sql_queries_handler')

/**
 * This is copied over from axon to avoid dependencies on c_nuc_utilities_lib
 * @param {script.principal.roles} accountRoles
 * @returns true / false
 */
function isNewSiteUser(accountRoles) {
  const NewSiteAccountRoles = [
    'Axon Site User',
    'Axon Site Monitor',
    'Axon Site Investigator',
    'Axon Site Auditor'
  ]

  const allowedSiteRoleIds = NewSiteAccountRoles.map(v => String(consts.roles[v] || ''))
  return accountRoles.some(v => allowedSiteRoleIds.includes(v.toString()))
}

const STATUS = {
  GENERATING: 'generating',
  TRANSFORMING: 'transforming',
  ERROR: 'error',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
  EXPIRED: 'expired',
  STARTING: 'starting',
  UNDEFINED: 'undefined'
}

const operationDefault = {
  reportCreationEndDate: '',
  reportCreationStartDate: '',
  error: {},
  status: STATUS.UNDEFINED,
  oo: '',
  csv: '',
  pdf: '',
  xls: '',
  reportId: '',
  operationId: '',
  pingMeAfter: ''
}

const cacheExpiryTimeInSeconds = 43200

/**
 * Checks the status of a running operation
 * @param {*} reportId
 */
function getReportOperation(reportId) {

  const report = org.objects.c_dmweb_reports
    .find({ _id: reportId })
    .skipAcl()
    .grant('read')
    .next()

  const { updated: principalUpdatedAt } = org.objects.account
    .find({ _id: script.principal._id })
    .paths('updated')
    .next()

  const operationCacheName = `c_dmweb_report_${script.principal._id}_${principalUpdatedAt}_${reportId}`

  const operationCacheValue = cache.get(operationCacheName)

  if (!operationCacheValue) return operationDefault

  if (operationCacheValue.oo) {
    const isStillThere = org.objects.OOs.find({
      name: operationCacheValue.oo
    })
      .hasNext()
    if (!isStillThere) {
      return {
        ...operationDefault,
        ...operationCacheValue,
        error: {},
        status: STATUS.EXPIRED,
        reportCreationDate: '',
        pingMeAfter: ''
      }
    }
  }

  const isSQLApi = !!_.get(report, 'c_report_cursor.transform.memo.sqlQuery')

  console.log('isSQLApi', isSQLApi)

  const isNotCompleted = operationCacheValue.status !== 'completed'
  const status = isSQLApi && isNotCompleted ? getSqlQueryStatus(operationCacheValue.oo) : operationCacheValue.status

  console.log('status', status)

  switch (status) {
    case STATUS.COMPLETED:
      const reportsUrl = `/routes/reports/${operationCacheValue.reportId}/${operationCacheValue.oo}`
      const hasCsv = {
        csv: report.c_csv_exportable ? `${reportsUrl}/csv` : ''
      }
      const hasPdf = {
        pdf: report.c_pdf_exportable ? `${reportsUrl}/pdf` : ''
      }
      const hasXls = {
        xls: report.c_xls_exportable ? `${reportsUrl}/xls` : ''
      }

      const isCacheStatusSynced = status === operationCacheValue.status

      // when cache status is not synced we need to update cache accordingly (only in SQLAPI)
      if (!isCacheStatusSynced && isSQLApi) {

        // end date is not set in SQL API because the service can not update the cache key
        if (!operationCacheValue.reportCreationEndDate) {

          const lastInsertedRecordCursor = org.objects.OOs
            .aggregate([{ $sort: { _id: -1 } }, { $project: { _id: 1 } }, { $limit: 1 }])
            .pathPrefix(`${operationCacheValue.oo}/list`)

          if (lastInsertedRecordCursor.hasNext()) {
            const lastInsertedRecord = lastInsertedRecordCursor.next()
            operationCacheValue.reportCreationEndDate = lastInsertedRecord._id.toDate()
          } else {
            // when there are no records inserted (empty report) then set the completion date to now
            operationCacheValue.reportCreationEndDate = new Date()
              .toISOString()
          }

        }

        operationCacheValue.status = status

        // set it to the cache so it does not need to re-run the previous query
        cache.set(operationCacheName, operationCacheValue, cacheExpiryTimeInSeconds)
      }

      return {
        ...operationDefault,
        ...operationCacheValue,
        ...hasCsv,
        ...hasPdf,
        ...hasXls,
        pingMeAfter: ''
      }
    case STATUS.ERROR:
      logger.error('Report errored: ', operationCacheValue)
      return { ...operationDefault, ...operationCacheValue, status, pingMeAfter: '' }
    case STATUS.CANCELLED:
      logger.warn('Report Cancelled: ', operationCacheValue)
      return { ...operationDefault, ...operationCacheValue, pingMeAfter: '' }
    default:
      console.log('report is still being generated')
      const operationTimeCacheName = `${operationCacheName}_time`
      const operationTimeCacheValue = cache.get(operationTimeCacheName)
      if (operationTimeCacheValue) {
        operationCacheValue.pingMeAfter = getPingmeAfter(
          operationCacheValue.reportCreationStartDate,
          operationTimeCacheValue.executionTime
        )
      }
      logger.info('Report is still in the making...', operationCacheValue)
      console.log('report status', { ...operationDefault, ...operationCacheValue })
      return { ...operationDefault, ...operationCacheValue }
  }
}

/**
 * Creates a new operation for the given report
 * @param {*} report
 */
function createReportOperation(report) {
  const reportId = report._id

  const { updated: principalUpdatedAt } = org.objects.account
    .find({ _id: script.principal._id })
    .paths('updated')
    .next()

  const operationCacheName = `c_dmweb_report_${script.principal._id}_${principalUpdatedAt}_${reportId}`
  const operationTimeCacheName = `${operationCacheName}_time`
  const counters = require('counters')
  const reportIdentifier = report.c_title
    .toLowerCase()
    .substring(0, 20)
    .trim()
    .split(' ')
    .map((x) => x.replace(/\W/g, ''))
    .join('_')
  const next = counters.next(reportIdentifier)
  const ooDumpName = `o_${reportIdentifier}_${next}_dump`
  const ooTableName = `o_${reportIdentifier}_${next}_table`
  const bulk = org.objects.bulk()
  const onCompleteScript = `
  const { arguments: { err, cancelled, memo: { 
        operationCacheName, 
        operationTimeCacheName, 
        ooTableName, 
        STATUS,
        cacheExpiryTimeInSeconds
      } 
    }
  } = script
  const cache = require('cache')
  const currentOperation = cache.get(operationCacheName)
  if(err) {

      console.error(err)

      const operation = {
        ...currentOperation,
        status: 'error',
        oo: ooTableName,
        error: err
      }
      cache.set(operationCacheName, operation, cacheExpiryTimeInSeconds)
  }else if(cancelled) {
    cache.set(operationCacheName, { ...currentOperation, status: STATUS.CANCELLED }, cacheExpiryTimeInSeconds)
  }else{
      const endDate = new Date()
      if(currentOperation.reportCreationStartDate) {
        const startDateMs = new Date(currentOperation.reportCreationStartDate).getTime()
        const endDateMs = endDate.getTime()
        const totalTimeMs = Math.max(0, endDateMs - startDateMs)
        cache.set(operationTimeCacheName, { executionTime: totalTimeMs }, cacheExpiryTimeInSeconds)
      }
      cache.set(operationCacheName, { ...currentOperation, 
        oo: ooTableName,
        status: STATUS.COMPLETED, 
        reportCreationEndDate: endDate.toISOString()
      }, cacheExpiryTimeInSeconds)
  }`
  const onCompleteSQLAPIScript = `
      const { arguments: { err, cancelled, memo: { 
        operationCacheName, 
        operationTimeCacheName, 
        ooTableName, 
        STATUS,
        cacheExpiryTimeInSeconds
      } 
    }
    } = script
    const cache = require('cache')
    const currentOperation = cache.get(operationCacheName)
    if(err) {

      console.error(err)

      const operation = {
        ...currentOperation,
        status: 'error',
        oo: ooTableName,
        error: err
      }
      cache.set(operationCacheName, operation, cacheExpiryTimeInSeconds)
    }else if(cancelled) {
      cache.set(operationCacheName, { ...currentOperation, status: STATUS.CANCELLED }, cacheExpiryTimeInSeconds)
    }else{
      cache.set(operationCacheName, { ...currentOperation, 
        oo: ooTableName,
        status: STATUS.GENERATING,
      }, cacheExpiryTimeInSeconds)
    }
  `
  const isSQLApi = !!_.get(report, 'c_report_cursor.transform.memo.sqlQuery')

  const operationCacheValue = cache.get(operationCacheName)

  const isOperationRunning =
    operationCacheValue &&
    (operationCacheValue.status === STATUS.GENERATING ||
      operationCacheValue.status === STATUS.TRANSFORMING)

  if (isOperationRunning) {
    const cancel = require('runtime').operations.cancel
    cancel({ uuid: operationCacheValue.operationId })
  }

  cache.del(operationCacheValue)

  const ooDumpProperties = [
    {
      label: 'Object Type',
      name: 'c_type',
      type: 'String',
      indexed: true,
      writable: true
    },
    {
      label: 'Object',
      name: 'c_object',
      type: 'Any',
      writable: true
    },
    {
      label: 'Path',
      name: 'c_path',
      type: 'String',
      indexed: true,
      writable: true
    },
    {
      label: 'Entity ID',
      name: 'c_entity_id',
      type: 'ObjectId',
      indexed: true,
      writable: true
    }
  ]

  createReportOO(reportId, ooDumpName, ooDumpProperties)

  const ooTableProperties = report.c_headers
  createReportOO(reportId, ooTableName, ooTableProperties)

  // here we create the memo that will be injected
  let memo = {
    ooDumpName,
    ooTableName,
    operationCacheName,
    operationTimeCacheName,
    STATUS,
    headers: report.c_headers,
    cacheExpiryTimeInSeconds
  }

  if (report.c_config) {
    memo = { ...memo, ...report.c_config }
  }

  let operations = []

  if (report.c_report_next) {
    // in this new type of report we use only one cursor to solve everything

    report.c_report_cursor.transform.memo = {
      ...memo,
      ...report.c_report_cursor.transform.memo
    }

    if (isSQLApi) {
      const expressionValues = report.c_report_cursor.transform.memo.values || []
      report.c_report_cursor.transform.memo.values = expressionValues.map(expression => runExpression(expression))
    }

    operations.push(report.c_report_cursor)
  } else {
    operations.push(...report.c_data.ops, ...report.c_transformation.ops)
  }

  // if user has new site user role and initial path read is set to c_site then change it to account, coz new site user can;t read c_sites directly
  if (isNewSiteUser(script.principal.roles) && !report.c_report_next) {
    operations.forEach((operation) => {
      if (operation.object === 'c_site' || operation.object === 'c_sites') {
        operation.object = 'account'
        operation.prefix = `${script.principal._id}/c_sites`
      }
    })
  }

  if (!report.c_report_next) {
    operations = setPrefixAndMemo(memo, operations)
  }

  operations.forEach((operation) =>
    bulk.add(createOperation(operation, operation), { wrap: false })
  )

  const newOperation = {
    ...operationDefault,
    reportId,
    reportCreationStartDate: new Date()
      .toISOString()
  }

  try {

    cache.set(
      operationCacheName,
      {
        ...newOperation,
        status: STATUS.GENERATING
      },
      cacheExpiryTimeInSeconds
    )

    const asyncConfig = {
      lock: {
        name: operationCacheName,
        restart: false
      },
      onComplete: isSQLApi ? onCompleteSQLAPIScript : onCompleteScript
    }

    return bulk
      .async(asyncConfig)
      .next()

  } catch (err) {
    if (err.errCode !== 'cortex.conflict.lockExists') {
      cache.set(
        operationCacheName,
        {
          ...newOperation,
          status: STATUS.ERROR,
          err: err.toJSON()
        },
        cacheExpiryTimeInSeconds
      )
    }
  }

  return cache.get(operationCacheName)
}

function create12HoursExpirationDate() {
  return Date.now() + 1000 * 60 * 720
}

function createReportOO(reportId, name, properties) {
  return org.objects.OOs.insertOne({
    label: name,
    name,
    context: {
      _id: reportId,
      object: 'c_dmweb_report'
    },
    cascadeDelete: true,
    expiresAt: create12HoursExpirationDate(),
    listOptions: {
      implicitCreateAccessLevel: 'delete',
      writeThrough: true,
      updateOnWriteThrough: false,
      grant: 'update'
    },
    properties
  })
    .bypassCreateAcl(true)
    .execute()
}

function setPrefixAndMemo(memo, operations) {
  return operations.map((operation) => {
    if (operation.prefix) {
      operation.prefix = operation.prefix
        .replace(/\$\{ooTableName\}/, memo.ooTableName)
        .replace(/\$\{ooDumpName\}/, memo.ooDumpName)
    }
    operation.transform = {
      ...operation.transform,
      memo: { ...memo, ...operation.transform.memo }
    }
    return operation
  })
}

function getPingmeAfter(startTime, usualExecutionTimeMs) {
  const currentTimeMs = new Date()
    .getTime()
  const startTimeMs = new Date(startTime)
    .getTime()
  const currentExecutionTimeMs = Math.abs(currentTimeMs - startTimeMs)
  const MINIMUM_SECONDS_TO_PING = 5000
  const remainingExecutionTimeMs = Math.max(
    MINIMUM_SECONDS_TO_PING,
    usualExecutionTimeMs - currentExecutionTimeMs
  )
  return new Date(currentTimeMs + remainingExecutionTimeMs)
    .toISOString()
}

module.exports = {
  isNewSiteUser,
  getReportOperation,
  createReportOperation,
  createReportOO
}