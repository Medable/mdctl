/***********************************************************

@script     CS - Send Notifications

@brief      Send all c_notifs objects On Cortex Event framework

(c)2016-2025 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/
const { send } = require('notifications'),
      logger = require('logger'),
      _ = require('lodash'), 
      { Events } = org.objects,
      { on, log, as, trigger } = require('decorators'),
      moment = require('moment.timezone'),
      CANCELED = 'canceled',
      SENT = 'sent',
      SCHEDULED = 'scheduled',
      SKIPPED = 'skipped',
      statusList = [SCHEDULED, SENT, CANCELED, SKIPPED],
      timeUnits = ['years', 'quarters', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds', 'milliseconds'],
      MINUTES_IN_HOUR = 60,
      DEACTIVATED = 'Deactivated'

const { NotificationStartStopConditions } = require('ab__notification_start_stop_conditions')

export class csNotifEvents {
  @log({ traceError: true })
  @as('c_system_user', { principal: { skipAcl: true, grant: consts.accessLevels.script }, acl: { safe: false }, modules: { safe: false } })
  @on('cs__notif', { name: 'cs__notif' })
  static cs__notif({ c_notif }) {
    const thisNotif = org.objects.c_notif.readOne({ _id: c_notif.toString() })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .execute()
    try {
      logger.debug(`Triggering notification: ${thisNotif.c_name}`)
      sendNotif(thisNotif)
      logger.debug(`Notification: ${thisNotif.c_name} sent`)
      const isNotifRescheduled = rescheduleNotif(thisNotif)
      logger.debug(`Notification: ${thisNotif.c_name} ${isNotifRescheduled ? 'rescheduled' : 'not rescheduled'}.`)
    } catch (e) {
      logger.error(e)
      catchAndSendErrorNotif(e, thisNotif)
    }
  }

}

/**
 * Schedules a notification for a user
 *
 * @param {object} notifData notification data
 */
export function scheduleNotif(notifData) {
  if (!notifData.c_name) {
    throw Error('name parameter required')
  }
  // can we check if it's a valid template?
  if (!notifData.c_recipient) {
    throw Error('recipient argument required')
  }

  if (notifData.c_recurring && !(notifData.c_recurrence.c_interval || notifData.c_recurrence.c_unit)) {
    throw Error('Need a recurrance interval and unit if recurring: true')
  }

  if (notifData.c_recurring && !timeUnits.includes(notifData.c_recurrence.c_unit)) {
    throw Error('recurrenceUnit needs to be one of the following values: \'years\', \'quarters\', \'months\', \'weeks\', \'days\', \'hours\', \'minutes\', \'seconds\', or \'milliseconds\'')
  }

  notifData.c_status = SCHEDULED
  notifData.c_iteration = 0
  notifData.c_baseline_date = notifData.c_date
  notifData.c_timeofday = getTimeOfDayFromDateTime(notifData.c_date)
  notifData.c_payload = notifData.c_payload ? JSON.stringify(notifData.c_payload) : JSON.stringify({})
  notifData.c_metadata = notifData.c_metadata || null
  notifData.c_additional_start_conditions = notifData.c_additional_start_conditions || []
  notifData.c_additional_stop_conditions = notifData.c_additional_stop_conditions || []
  let thisNotif = null
  script.as(
    consts.serviceAccounts.c_system_user,
    { safe: false, principal: { skipAcl: true, grant: 'update' } },
    () => {
      thisNotif = org.objects.c_notif
        .insertOne(notifData)
        .skipAcl()
        .grant(consts.accessLevels.update)
        .lean(false)
        .execute()
    }
  )
  logger.info(`Scheduled notification ${notifData.c_name} at ${notifData.c_date} for ${notifData.c_recipient}. EventID: ${thisNotif._id}`)
  insertCortexEvent(`${thisNotif._id}|0`, { c_notif: thisNotif._id }, notifData.c_date)
}

/**
 * Schedules many notifications
 *
 * @param {object} notificationsDataArray array of notification data
 */
export function scheduleManyNotifs(notificationsDataArray) {

  if (notificationsDataArray.some(n => !n.c_name)) {
    throw Error('name parameter required')
  }
  if (notificationsDataArray.some(n => !n.c_recipient)) {
    throw Error('recipient argument required')
  }
  if (notificationsDataArray.some(n => n.c_recurring && !(n.c_recurrence.c_interval || n.c_recurrence.c_unit))) {
    throw Error('Need a recurrance interval and unit if recurring: true')
  }
  if (notificationsDataArray.some(n => n.c_recurring && !timeUnits.includes(n.c_recurrence.c_unit))) {
    throw Error('recurrenceUnit needs to be one of the following values: \'years\', \'quarters\', \'months\', \'weeks\', \'days\', \'hours\', \'minutes\', \'seconds\', or \'milliseconds\'')
  }

  const notificationsInsertPayload = notificationsDataArray.map(n => ({
    ...n,
    c_status: SCHEDULED,
    c_iteration: 0,
    c_baseline_date: n.c_date,
    c_timeofday: getTimeOfDayFromDateTime(n.c_date),
    c_payload: n.c_payload ? JSON.stringify(n.c_payload) : JSON.stringify({}),
    c_additional_start_conditions: n.c_additional_start_conditions || [],
    c_additional_stop_conditions: n.c_additional_stop_conditions || []
  }))

  /**
   * example of insertMany response
   * {
        "insertedCount": 3,
        "insertedIds": [
            {
                "_id": "62e92920044ee76e1ee19ad0",
                "index": 0
            },
            {
                "_id": "62e92920044ee7616fe19ad1",
                "index": 1
            },
            {
                "_id": "62e92920044ee73eede19ad2",
                "index": 2
            }
        ],
        "writeErrors": []
    }
   */
  let insertNotificationsResponse = []

  script.as(
    consts.serviceAccounts.c_system_user,
    { safe: false, principal: { skipAcl: true, grant: 'update' } },
    () => {
      insertNotificationsResponse = org.objects.c_notif
        .insertMany(notificationsInsertPayload)
        .skipAcl()
        .grant(consts.accessLevels.update)
        .execute()
    }
  )

  if (insertNotificationsResponse.writeErrors.length > 0) {
    logger.error('An error occurred on inserting notifications in c_notif object', insertNotificationsResponse.writeErrors)
    throw Error('An error occurred on inserting notifications in c_notif object')
  }

  const cortexEventsInsertPayload = insertNotificationsResponse.insertedIds.map(nr => ({
    type: 'script',
    event: 'cs__notif',
    key: `${nr._id}|0`,
    param: { c_notif: nr._id },
    start: notificationsDataArray[nr.index].c_date
  }))

  org.objects.Event.insertMany(cortexEventsInsertPayload)
    .skipAcl()
    .grant(consts.accessLevels.script)
    .bypassCreateAcl()
    .execute()
}

/**
 * Skips a list of notifications
 *
 * @param {Array.<string>} notifIds array of notification ids that should be skipped
 * @returns {object} object containing infos about update action success status
 */
export function skipNotif(notifIds) {
  return setStatus(notifIds, SKIPPED)
}

/**
 * Cancels a list of notification
 *
 * @param {Array.<string> | string} notifIds array of notification ids that should be canceled
 * @param {string} reason optional reason for cancellation
 * @returns {object} object containing infos about update action success status
 */
function cancelNotif(notifIds, reason) {
  return setStatus(notifIds, CANCELED, reason)
}

/**
 * Checks if the user is a study participant
 * 
 * @param {object} userAccount user account object
 * @returns {boolean} true if user is a study participant, false otherwise
 */
export function isStudyParticipantUser(userAccount) {
  const roleIds = (userAccount.roles || []).map(String)
  const studyParticipantRoleId = String(consts.roles.c_study_participant)
  return roleIds.includes(studyParticipantRoleId)
}

/**
 * Sets the c_status property for a single c_notif object
 *
 * @param {Array.<string> | string} notifIds array of notification IDs
 * @param {string} status status to set
 * @param {string} reason optional reason for cancellation (used when status is 'canceled')
 * @returns {object} object containing infos about update action success status
 */
function setStatus(notifIds, status, reason) {
  if (!statusList.includes(status)) {
    throw Error(`Must send a valid status: ${statusList.join(', ')}`)
  }

  const payload = {
    c_status: status
  }
  
  // Add cancellation reason if status is canceled and reason is provided
  if (status === CANCELED && reason) {
    payload.c_canceled_reason = reason
  }

  if (Array.isArray(notifIds)) {
    return org.objects.c_notif
      .updateMany(
        { _id: { $in: notifIds } },
        { $set: payload }
      )
      .skipAcl()
      .grant(consts.accessLevels.update)
      .execute()
  } else {
    return org.objects.c_notif
      .updateOne({ _id: notifIds },
        { $set: payload }
      )
      .skipAcl()
      .grant(consts.accessLevels.update)
      .execute()
  }
}

/**
 * checks if notification is sendable
 *
 * @param {object} notification notification object
 * @returns {boolean} true if notification is sendable, false otherwise
 */
export function isSendable(notification) {
  if (!org.objects.account.find({ _id: notification.c_recipient._id })
    .skipAcl()
    .grant(consts.accessLevels.read)
    .hasNext()) {
    cancelNotif(notification._id, 'Recipient account not found')
    return false
  }
  if (isStopScriptMet(notification)) {
    cancelNotif(notification._id, 'Stop script condition met')
    return false
  }
  if (notification && notification.c_status === SCHEDULED) {
    return true
  }
}

/**
 * checks if notification stop condition query is met
 *
 * @param {object} notification notification object
 * @returns {boolean} true if notification stop condition is met and notification can be sent, false otherwise
 */
function isStopConditionsMet(notification) {
  // if (notification && notification.c_stop_query_condition) {
  //   for (const condition of notification.c_stop_query_condition.split(';')) {
  //     const rows = sql(condition)
  //     if (rows.length > 0) {
  //       logger.info(`Notification ${notification._id} not sent because stop condition query ${condition} returned ${rows.length} rows`)
  //       return false
  //     }
  //   }
  // }
  return true
}

/**
 * runs a script and returns the value
 *
 * @param {string} the string containing the script that needs to be run
 * @returns {string} the value of the script
 */
function runScriptAndReturnBoolean(script) {
  return new Function(script)();
}

/**
 * checks if notification stop script is met
 *
 * @param {object} notification notification object
 * @returns {boolean} true if notification any of the stop script conditions are met and notification should be cancelled, false otherwise and send notification
 */
function isStopScriptMet(notification) {
  if (!notification.c_stop_script_condition) {
    return false
  }
  
  // Ensure user object is available for all stop scripts
  const participantNumber = JSON.parse(notification.c_payload).participantNumber
  const user = org.objects.c_public_user.readOne({c_number: participantNumber}).execute()
  
  const stopConditions = notification.c_stop_script_condition.split(';').filter(sc => sc.trim() !== '')
  return stopConditions.some(sc => runScriptAndReturnBoolean(sc))
}

/**
 * @param {object} notification notification object
 * @param {object} aggregationPayload aggregation object payload
 */
function sendNotif(notification, aggregationPayload) {
  if (isSendable(notification)) {
    let payload = notification.c_payload ? JSON.parse(notification.c_payload) : {}
    if (aggregationPayload) payload = aggregationPayload

    const recipientId = notification.c_recipient._id
    const recipient = org.objects.account
      .readOne({ _id: recipientId })
      .paths('locale', 'roles', 'locked')
      .skipAcl()
      .grant(consts.accessLevels.read)
      .execute()
    const locale = recipient.locale

    const recipientEligibleForNotification = isRecipientEligible(notification, recipient)

    if (recipientEligibleForNotification) {
      // Check additional start and stop conditions before sending
      let publicUserId
      if (notification.c_caregiver_client) {
        publicUserId = notification.c_caregiver_client._id
      } else {
        publicUserId = (isStudyParticipantUser(recipient) ? org.objects.c_public_user.find({ c_account: recipient._id }).toArray()[0]._id : null)
      }
      let publicUserAccountId = null
      if (publicUserId) {
        publicUserAccountId = org.objects.c_public_user.find({ _id: publicUserId }).toArray()[0].c_account._id
      }
      let event = null
      if (notification.c_cortex_event) {
        event = org.objects.c_event.readOne({ _id: notification.c_cortex_event._id }).execute()
      }
      const startStopConditionChecker = new NotificationStartStopConditions()
      const context = {
        publicUserID: publicUserId,
        publicUserAccountId: publicUserAccountId,
        event: event
      }
      
      // Check start conditions
      if (notification.c_additional_start_conditions.length > 0) {
        const startConditionResult = startStopConditionChecker.checkAllStartConditions(notification, context)
        if (!startConditionResult.shouldStart) {
          logger.warn(`sendNotif: ${notification.c_name}, ${JSON.stringify(payload)} not sent due to start condition: ${startConditionResult.reason}`)
          cancelNotif(notification._id, startConditionResult.reason)
          return
        }
      }
      
      // Check stop conditions
      if (notification.c_additional_stop_conditions.length > 0) {
        const stopConditionResult = startStopConditionChecker.checkAllStopConditions(notification, context)
        if (!stopConditionResult.shouldContinue) {
          logger.warn(`sendNotif: ${notification.c_name}, ${JSON.stringify(payload)} not sent due to stop condition: ${stopConditionResult.reason}`)
          cancelNotif(notification._id, stopConditionResult.reason)
          return
        }
      }

      logger.info(`sendNotif send( ${notification.c_name}, ${JSON.stringify(payload)}, recipient: ${recipient}, locale: ${locale} )`)
      send(notification.c_name, payload, { recipient, locale })
      logger.info(`sendNotif sent( ${notification.c_name}, ${JSON.stringify(payload)}, recipient: ${recipient}, locale: ${locale} )`)

      createSentRecord(notification._id)

      if (!notification.c_recurring) {
        updateNotif({ _id: notification._id }, { c_status: SENT })
      }
    } else {
      logger.warn(`sendNotif: ${notification.c_name}, ${JSON.stringify(payload)} not sent because recipient is not eligible for notification`)
      cancelNotif(notification._id, 'Recipient is not eligible for notification')
    }
  }
}

/**
 * Checks if the recipient is eligible to receive the notification
 * 
 * @param {object} notification notification object
 * @param {object} recipient recipient object
 * @returns {boolean} true if recipient is eligible to receive the notification, false otherwise
 */
function isRecipientEligible(notification, recipient) {
  // Check if account is locked
  if (recipient.locked) {
    const payload = notification.c_payload ? JSON.parse(notification.c_payload) : {}
    logger.warn(`sendNotif: ${notification.c_name}, ${JSON.stringify(payload)} not sent because recipient account is locked`)
    return false
  }

  if (isStudyParticipantUser(recipient)) {
    const publicUser = org.objects.c_public_user
      .readOne({ c_account: recipient._id })
      .paths('c_status')
      .skipAcl()
      .grant(consts.accessLevels.read)
      .execute()
    const payload = notification.c_payload ? JSON.parse(notification.c_payload) : {}
    let logMessage = 'Recipient is active and eligible to receive notification'

    if (publicUser.c_status === DEACTIVATED) {
      logMessage = `Recipient: ${publicUser._id} is deactivated and not eligible to receive notification`
      logger.warn(`sendNotif: ${notification.c_name}, ${JSON.stringify(payload)} - ${logMessage}`)
      return false
    }

    if (notification.c_caregiver_client) {
      const participantUser = org.objects.c_public_user
        .readOne({ _id: notification.c_caregiver_client._id })
        .paths('c_status')
        .skipAcl()
        .grant(consts.accessLevels.read)
        .execute()

      if (participantUser.c_status === DEACTIVATED) {
        logMessage = `Participant: ${participantUser._id} is deactivated so caregiver: ${publicUser._id} is not eligible to receive notification`
        logger.warn(`sendNotif: ${notification.c_name}, ${JSON.stringify(payload)} not sent because participant is deactivated`)
        return false
      }
      
      if (!isAssociatedCaregiverActive(publicUser._id, participantUser._id)) {
        logMessage = `Caregiver: ${publicUser._id} is inactive so is not eligible to receive notification`
        logger.warn(`sendNotif: ${notification.c_name}, ${JSON.stringify(payload)} not sent because caregiver is inactive`)
        return false
      }
    }
  }

  return true
}

/**
 * Determines if the given caregiver (by public user ID) is active for the participant.
 *
 * @param {string} caregiverPublicUserId - ID of the caregiver's public user
 * @param {string} participantPublicUserId - ID of the participant's public user
 * @returns {boolean}
 */
function isAssociatedCaregiverActive(caregiverPublicUserId, participantPublicUserId) {
  const caregiverRelationship = org.objects.c_public_user
      .find({ _id: participantPublicUserId })
      .paths('c_caregiver_relationship')
      .toArray()[0].c_caregiver_relationship
    
  const caregiversInfo = org.objects.c_caregiver_relationship
      .find({ _id: caregiverRelationship._id })
      .paths('c_caregivers_info')
      .toArray()[0].c_caregivers_info || []
  
  // Check if there is an associated caregiver
  const associatedCaregiver = caregiversInfo.find(info =>
      String(info.c_public_user._id) === String(caregiverPublicUserId))
      
  // If no caregiver found, do not allow notification
  if (!associatedCaregiver) {
    return false
  }
  
  return associatedCaregiver.c_caregiver_active === true
}

function createSentRecord(notifID) {
  const record = {
    c_notif: notifID,
    c_sent: new Date()
  }

  // Insert new sent record for notification.
  return org.objects.c_sent_notif
    .insertOne(record)
    .bypassCreateAcl()
    .grant('delete')
    .execute()
}

/**
 * @param {object} thisNotif notification object
 * @returns {boolean|undefined} false if account is not found
 */
function rescheduleNotif(thisNotif) {
  if (
    !org.objects.account
      .find({ _id: thisNotif.c_recipient._id })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .hasNext()
  ) {
    return false
  }
  if (thisNotif.c_recurrence && thisNotif.c_recurrence.c_frequency && thisNotif.c_iteration >= thisNotif.c_recurrence.c_frequency) {
    updateNotif({ _id: thisNotif._id }, { c_status: SENT })
    return false
  }
  if (thisNotif && thisNotif.c_recurring && thisNotif.c_status === SCHEDULED) {
    // backwards compatible checks/updates
    if (!thisNotif.c_tz) {
      thisNotif.c_tz = updateNotifsTZs(thisNotif.c_recipient._id)
    }

    // recalcs vs timezone & daylight savings & timetravel
    const now = moment()
    let additionalIterations = 1,
        newDate = getTZNormalizedDate(thisNotif, additionalIterations)
    while (now.isAfter(newDate)) {
      additionalIterations++
      newDate = getTZNormalizedDate(thisNotif, additionalIterations)
    }

    insertCortexEvent(
      `${thisNotif._id}|${thisNotif.c_iteration + additionalIterations}`,
      { c_notif: thisNotif._id },
      newDate
    )

    const notifUpdate = {
      c_date: newDate,
      c_status: SCHEDULED,
      c_iteration: thisNotif.c_iteration + additionalIterations
    }

    updateNotif({ _id: thisNotif._id }, notifUpdate)
    return true
  }
  return false
}

/**
 * @param {object} errorInstance error object
 * @param {object} notification notification object
 */
function catchAndSendErrorNotif(errorInstance, notification) {
  logger.error('Caught Error: ' + errorInstance.toString() + ' Sending Error Notification')
  const { message, reason, trace } = errorInstance,
        info = [
          { name: 'Script Name: cs__notifications', value: `c_notif._id: ${notification._id.toString()}` },
          { name: 'Error Reason', value: message + ' ' + reason },
          { name: 'Stack Trace', value: trace }
        ]

        send('c_error', { info, env: script.env.name, orgCode: script.org.code }, { recipient: script.principal._id })
        rescheduleNotif(notification)
}

/**
 * @param {string} dateTime moments datetime string
 * @returns {number} offset from start of day in seconds
 */
function getTimeOfDayFromDateTime(dateTime) {
  const utcOffset = moment.parseZone(dateTime)
    .utcOffset()
  return (moment(dateTime)
    .utcOffset(utcOffset)
    .format('HH') * MINUTES_IN_HOUR) + Number(moment(dateTime)
    .utcOffset(utcOffset)
    .format('m')) || null
}

/**
 * @param {object} notification notification object
 * @returns {number} offset time
 */
function updateTimeOfDayOffset(notification) {
  const timeOfDayToSend = moment(notification.c_baseline_date)
    .tz(notification.c_tz)
    .diff(
      moment(notification.c_baseline_date)
        .tz(notification.c_tz)
        .startOf('day'),
      'minutes'
    )

  updateNotif({ _id: notification._id }, { c_timeofday: timeOfDayToSend })

  return timeOfDayToSend
}

/**
 * @param {string} accountId account ID
 * @returns {string} users timezone
 */
function updateNotifsTZs(accountId) {
  const tz = org.objects.accounts.readOne({ _id: accountId })
    .skipAcl()
    .grant(consts.accessLevels.read)
    .execute().tz || 'GMT'
  org.objects.c_notif.updateMany({ c_recipient: accountId },
    { $set: { c_tz: tz } })
    .skipAcl()
    .grant(consts.accessLevels.update)
    .execute()
  return tz
}

/**
 * @param {object} notification notification object
 * @param {number} additionalIterations interval for rescheduling
 * @returns {string} date in ISO string format
 */
function getTZNormalizedDate(notification, additionalIterations) {
  // backwards compatibility check
  if (!notification.c_timeofday) { notification.c_timeofday = updateTimeOfDayOffset(notification) }
  return moment(notification.c_baseline_date)
    .tz(notification.c_tz) // grab subject current timezone
    .startOf('day') // now at midnight local time
    .add(notification.c_timeofday, 'minutes') // normalized to the ticket, updates in accordance to TZ changes, and daylight savings time
    .add(notification.c_iteration * notification.c_recurrence.c_interval, notification.c_recurrence.c_unit) // recurrence sched * interval // days add
    .add(additionalIterations * notification.c_recurrence.c_interval, notification.c_recurrence.c_unit) // add one more day for tomorrow, this is a reschedule
    .tz('GMT') // back to server tz
    .format()
}

/**
 * @param {string} accountId account ID
 */
function normalizeSendDateToTZChanges(accountId) {
  org.objects.c_notif.find({ c_recipient: accountId })
    .forEach(notif => {
      // recalcs vs timezone & daylight savings
      const offset = 0, // offset param usually for scheduling next notif, we're just changing tz here
            newDate = getTZNormalizedDate(notif, offset),
            updatedNotif = updateNotif({ _id: notif._id }, { c_date: newDate }),
            updatedEvent = Events.updateOne({ key: `${notif._id}|${notif.c_iteration}` }, { $set: { start: newDate } })
              .skipAcl()
              .grant(consts.accessLevels.update)
              .execute()
      logger.debug({ updatedNotif, updatedEvent })
    })
}

/**
 * @param {object} query query to find updated documents
 * @param {object}setUpdate properties to update with set
 * @param {object} pushUpdate properties to update with push
 * @returns {object} updated c_notif object
 */
function updateNotif(query, setUpdate, pushUpdate = {}) {
  return org.objects.c_notif.updateOne(query, {
    $set: setUpdate,
    $push: pushUpdate
  })
    .lean(false)
    .skipAcl()
    .grant(consts.accessLevels.update)
    .execute()
}

/**
 * @param {string} key unique event key
 * @param {object} param event param
 * @param {string} startDate date when event should fire
 * @returns {object} cortex event object
 */
function insertCortexEvent(key, param, startDate) {
    logger.info(`Inserting cs__notif event ${key}`)
  return Events.insertOne({
    type: 'script',
    event: 'cs__notif',
    key: key,
    param: param,
    start: startDate
  })
    .bypassCreateAcl()
    .grant(consts.accessLevels.update)
    .execute()
}

export class NotifTriggers {

  @trigger('err.events.failed')
  handleError({ context, params: { err } }) {
    if (context.event === 'cs__notif') {
      const message = `Error in Cortex Event: ${context.event} with notification ${context.param.c_notif.toString()}`
      logger.error(message, err)
      const info = [
        { name: 'Script Name: cs__notifications', value: `c_notif._id: ${context.param.c_notif.toString()}` },
        { name: 'Error Type', value: 'Cortex Event Timeout/Failure' },
        { name: 'Context', value: err.message + ' ' + err.reason },
        { name: 'Additional Information', value: 'This notification has been rescheduled if it was recurring. Otherwise it was missed.' },
        { name: 'Stack Trace', value: err.trace }
      ]
      
      try {
        const notification = org.objects.c_notif.readOne({ _id: context.param.c_notif.toString() })
          .skipAcl()
          .grant(consts.accessLevels.read)
          .execute()

        if (err.code === 'kTimeout' && err.trace) {
          if (err.trace.includes('sendNotif')) {
          logger.debug(`Detected timeout during sendNotif for ${notification._id}`)          
          logger.debug(`HandleError: Triggering notification: ${notification.c_name}`)
          sendNotif(notification)
          logger.debug(`HandleError: Notification: ${notification.c_name} sent`)
          rescheduleNotif(notification)
          logger.debug(`HandleError: Notification: ${notification.c_name} rescheduled`)
          }
          else if (err.trace.includes('rescheduleNotif')) {
            logger.debug(`Detected timeout during rescheduleNotif for ${notification._id}`)
            rescheduleNotif(notification)
            logger.debug(`HandleError: Notification: ${notification.c_name} rescheduled`)
          }
        }
        
        if (notification.c_recurring) {
          if (notification.c_recurrence.c_frequency && notification.c_iteration >= notification.c_recurrence.c_frequency) {
            logger.debug(`Notification ${notification._id} is recurring and will not be rescheduled because recurrence iteration > frequency`)
          } else if (notification.c_recurrence.c_frequency && (notification.c_recurrence.c_interval < notification.c_recurrence.c_frequency)) {
            logger.debug(`Notification ${notification._id} is recurring and will not be rescheduled because recurrence interval < frequency`)
          } else {
            rescheduleNotif(notification)
          }
        }
      } catch (recoveryError) {
        logger.error(`Failed to recover from notification error: ${recoveryError.message}`)
      }
      
      send('c_error', { info, env: script.env.name, orgCode: script.org.code }, { recipient: script.principal._id })
    }
  }

  @log({ traceResult: true, traceError: true })
  @trigger('update.after', {
    object: 'account',
    weight: 1,
    principal: 'c_system_user',
    if: {
      $gte: [{
        $indexOfArray: [
          '$$SCRIPT.arguments.modified',
          'tz'
        ]
      }, 0]
    }
  })
  static accountUpdate() {
    if (script.arguments.modified.includes('tz')) {
      const acctId = script.context._id
      updateNotifsTZs(acctId)
      normalizeSendDateToTZChanges(acctId)
    }
  }
}