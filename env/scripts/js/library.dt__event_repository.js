const { events } = org.objects,
      logger = require('logger')

class EventRepository {

  static createDtEventExpExecution(params) {
    return this._create('dt__event_exp_execution', params)
  }

  static createDtEventCronScheduleExpExecution(params) {
    return this._create('dt__event_cron_schedule_exp_execution', params)
  }

  static createDtEventAirflowCheckDtDagRunStatus(params) {
    return this._create('dt__event_airflow_check_dt_dag_run_status', params)
  }

  static _create(event, params = {}) {
    logger.debug('EventLibrary.create', params)
    const result = events.insertOne({
      type: 'script',
      key: `${event}_${params.key}_${Date.now()}`,
      event,
      principal: script.principal._id,
      param: params.payload,
      // The start property is overridden with the time of the next tick for the cron schedule.
      // The property still has to be passed otherwise the event would not be triggered.
      start: params.startAt || new Date(),
      ...(params.expiresAt && { expiresAt: params.expiresAt }),
      ...(params.schedule && { schedule: params.schedule })
    })
      .skipAcl()
      .grant('update')
      .bypassCreateAcl()
      .lean(false)
      .execute()
    logger.debug('EventLibrary.create', { result })
    return result
  }

  static deleteByKeyPart(keyPart) {
    logger.debug('EventLibrary.deleteByKeyPart', { keyPart })
    const result = events.deleteMany({ key: new RegExp(`(.*)${keyPart}(.*)`) })
      .skipAcl()
      .grant('delete')
      .execute()
    logger.debug('EventLibrary.deleteByKeyPart', { result })
    return result
  }

}

module.exports = EventRepository