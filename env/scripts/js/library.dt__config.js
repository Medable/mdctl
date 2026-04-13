/**
 * @fileOverview
 * @summary Data Transfer Library
 * @version 1.0.0
 *
 * @author Data Management Squad
 *
 * @example
 * const DTConfig = require('dt__config')
 */

const { trigger, job, as, object, route, expressions: { expression } } = require('decorators'),
      { merge } = require('lodash'),
      logger = require('logger'),
      expr = require('expressions'),
      faults = require('c_fault_lib'),
      EventRepository = require('dt__event_repository'),
      TransferService = require('dt__transfer_service'),
      moment = require('moment.timezone')

/**
 * DTConfig object
 * @extends CortexObject
 */
@object('dt__config')
// eslint-disable-next-line no-undef
class DTConfig extends CortexObject {

  /**
  This method returns a hard-coded password which is getting used to replace an empty password with ******* in UI
  */
  static getDefaultPassword() {
    return '***********'
  }

  static getConfig(id) {
    const [dt__config] = org.objects.dt__config.find({ _id: id })
    if (!dt__config) {
      return null
    }
    // Replace password fields with defaultPassword
    if (dt__config.dt__target) {
      if (dt__config.dt__target.dt__password) {
        dt__config.dt__target.dt__password = this.getDefaultPassword()
      }
      if (dt__config.dt__target.dt__pem_file) {
        dt__config.dt__target.dt__pem_file = this.getDefaultPassword()
      }
    }
    if (dt__config.dt__sftp_target) {
      if (dt__config.dt__sftp_target.dt__password) {
        dt__config.dt__sftp_target.dt__password = this.getDefaultPassword()
      }
      if (dt__config.dt__sftp_target.dt__pem_file) {
        dt__config.dt__sftp_target.dt__pem_file = this.getDefaultPassword()
      }
    }
    return dt__config
  }

  /**
   * Named expression to validate status
   * @type {$cond: {else: boolean, then: {$cond: {else: boolean, then: boolean, if: string}}, if: {$eq: string[]}}}
   * @memberOf DTConfig
   * @return {Object} expression
   */
  @expression
  dt__config__requireValidatorStatus = {
    '$cond': {
      'if': {
        $or: [{
          $and: [{
            '$eq': ['$$ROOT.dt__status', 'READY_TO_TRANSFER']
          }, '$$ROOT.dt__sftp_target.dt__zipped']
        },
        {
          $and: [{
            '$eq': ['$$ROOT.dt__status', 'READY_TO_TRANSFER']
          }, '$$ROOT.dt__target.dt__zipped']
        }]
      },
      'then': {
        '$cond': {
          'if': '$value',
          'then': true,
          'else': false
        }
      },
      'else': true
    }
  }

  /**
   * Named expression to validate pem file
   * @type expression
   * @memberOf DTConfig
   * @return {Object} expression
   */
  @expression
  dt__config__passwordOrPem = true // TODO: remove it, validation on beforeUpdate

  /**
   * Named expression to validate password
   * @type expression
   * @memberOf DTConfig
   * @return {Object} expression
   */
  @expression
  dt__config__pemOrPassword = true // TODO: remove it, validation on beforeUpdate

  /**
   * After update configuration we need to see if it was configured to be scheduled
   * if so we create a scheduled event otherwise a run now event is going to be created.
   * @param {DTConfig} context The updated dt__config object.
   */
  @trigger('update.after', {
    name: 'dt__config_after_update',
    export: 'dt__config_after_update',
    object: 'dt__config',
    weight: 1
  })
  static afterUpdate({ context }) {
    TransferService.schedule(context._id)
  }

  @trigger('update.before', {
    name: 'dt__config_before_update',
    export: 'dt__config_before_update',
    object: 'dt__config',
    weight: 1
  })
  beforeUpdate({ context, old }) {
    logger.debug('dt__config_before_update', { _id: context._id })
    const { dt__sftp_target: payloadOldTarget, dt__target: payloadNewTarget, dt__status: payloadStatus, dt__schedule: payloadSchedule } = context,
          { dt__sftp_target: currentoldTarget, dt__target: currentNewTarget, dt__status: currentStatus, dt__schedule: currentSchedule } = old,
          isReady = payloadStatus === 'READY_TO_TRANSFER' || currentStatus === 'READY_TO_TRANSFER'

    const currentTarget = currentNewTarget || currentoldTarget,
          payloadTarget = payloadNewTarget || payloadOldTarget
    if (isReady) {
      const target = merge({}, currentTarget, payloadTarget),
            schedule = merge({}, currentSchedule, payloadSchedule)
      if (target && (!target.dt__username || !target.dt__host) && (!target.dt__password && !target.dt__pem_file)) {
        faults.throw('dt.invalidArgument.requiredTargetFields')
      }

      if (schedule && schedule.dt__active && schedule.dt__start_date) {
        const start = moment.tz(moment(schedule.dt__start_date)
                .format('YYYY-MM-DD HH:mm:ss'), schedule.dt__start_timezone || 'UTC'),
              startWithInc = start.add(schedule.dt__repeat_value || 1, schedule.dt__increment || 'hours')

        if (schedule.dt__end_date) {
          const end = moment.tz(moment(schedule.dt__end_date)
            .format('YYYY-MM-DD HH:mm:ss'), schedule.dt__end_timezone || schedule.dt__start_timezone || 'UTC')
          if (end.isBefore(start) || end.isBefore(startWithInc)) {
            faults.throw('dt.invalidArgument.invalidScheduleDates')
          }
        }
      }
    }
  }

  @trigger('create.before', {
    name: 'dt__config_before_create',
    export: 'dt__config_before_create',
    object: 'dt__config',
    weight: 1
  })
  beforeCreate({ context }) {
    let { dt__bundle_name: bundleName } = context

    if (!bundleName) {
      const [study] = org.objects.c_study.find()

      bundleName = study.c_protocol_number
        ? `${study.c_protocol_number}`
        : `${study.c_name.replace(/\s+/g, '_')}`

      context.update('dt__bundle_name', bundleName)
    }
  }

  /**
   * Job that executes each 3 minutes to check if there is a job to process.
   */
  @job('*/3 * * * *', {
    name: 'dt__job_scheduledTransfers',
    principal: 'dt__service',
    if: {
      $ifNull: [{
        $dbNext: [
          {
            $literal: {
              object: 'dt__config',
              where: {
                dt__status: 'SCHEDULED_TRANSFER',
                'dt__schedule.dt__end_date': { $exists: true }
              }
            }
          }]
      }, false]
    }
  })
  @as('dt__service', { principal: { skipAcl: true, grant: 'script' }, safe: false })
  static checkScheduledTransfers() {
    const exp = [{
            $cursor: {
              object: 'dt__config',
              operation: 'cursor',
              where: {
                dt__status: 'SCHEDULED_TRANSFER',
                'dt__schedule.dt__end_date': { $exists: true }
              }
            }
          }, {
            $match: {
              $gte: [
                { $moment: [new Date(), { tz: 'utc' }, { format: 'YYYY-MM-DD HH:mm:ss' }] },
                {
                  $moment: [
                    { init: [{ $moment: ['$$ROOT.dt__schedule.dt__end_date', { format: 'YYYY-MM-DDTHH:mm:ss' }] }, 'tz', { $ifNull: ['$$ROOT.dt__schedule.dt__start_timezone', { $ifNull: ['$$ROOT.dt__schedule.dt__end_timezone', 'utc'] }] }] }, { utc: '' }, { format: 'YYYY-MM-DD HH:mm:ss' }]
                }
              ]
            }
          },
          {
            $project: { _id: '$$ROOT._id' }
          }],
          result = expr.pipeline.run(exp)
            .toArray(),
          ids = result.map(r => r._id) || []
    if (ids.length > 0) {
      ids.forEach((id) => {
        // remove previous event if there was one
        logger.debug(`About to delete all previous events for: ${id}`)
        EventRepository.deleteByKeyPart(id)
      })
      org.objects.dt__config.updateMany({ _id: { $in: ids } }, { $set: { dt__status: 'COMPLETED' } })
        .skipAcl()
        .grant(6)
        .execute()
    }
  }

  /**
   * Update a dt__config
   * @memberOf DTConfig
   * @path {PUT} /data-transfers/config/:id
   * @params {String} :id DTConfig _id
   * @example
   * curl -X PUT 'https://api-int-dev.medable.com/data-transfers/v2/routes/data-transfers/config/{id}'
   */
  @route('PUT /data-transfers/config/:id', {
    name: 'dt__config_update',
    acl: 'role.dt__admin',
    authValidation: 'all'
  })
  static updateConfig({ req, body }) {
    const id = req.params.id
    const modified = body()
    if (modified && modified['$set']) {
      if (modified['$set'].dt__target) {
        if (modified['$set'].dt__target.dt__password === DTConfig.getDefaultPassword()) {
          delete modified['$set'].dt__target.dt__password
        }
        if (modified['$set'].dt__target.dt__pem_file === DTConfig.getDefaultPassword()) {
          delete modified['$set'].dt__target.dt__pem_file
        }
      }
      if (modified['$set'].dt__sftp_target) {
        if (modified['$set'].dt__sftp_target.dt__password === DTConfig.getDefaultPassword()) {
          delete modified['$set'].dt__sftp_target.dt__password
        }
        if (modified['$set'].dt__sftp_target.dt__pem_file === DTConfig.getDefaultPassword()) {
          delete modified['$set'].dt__sftp_target.dt__pem_file
        }
      }
    }
    org.objects.dt__config.updateOne({ _id: id }, modified)
      .skipAcl()
      .grant(8)
      .execute()
    const config = this.getConfig(id)
    return { ...config }
  }

}

module.exports = DTConfig