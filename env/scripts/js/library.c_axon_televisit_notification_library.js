/***********************************************************

 @script     Axon - Televisit Notification Library

 @brief      Utility functions for sending notifications related
             to televisit events, and for determining which notifications
             need to be sent.

 @exports     sendVisitCreatedEmail
 @exports     sendVisitRescheduledEmail
 @exports     sendVisitCanceledEmail
 @exports     sendVirtualVisitReminder
 @exports     sendMissedVisitNotification
 @exports     remindersForEvent

 @author     Pete Richards

 (c)2020 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import moment from 'moment.timezone'
import notifications from 'notifications'
import logger from 'logger'

function getLocale(event) {
  return event.c_public_user.c_locale
}

function getRecipient(publicUser) {
  return publicUser.c_account || publicUser.c_email
}

function getAccountInfo(accountId) {
  return org.objects.account.find({ _id: accountId })
    .skipAcl()
    .paths(['name'])
    .next()
}

/**
 * Gets all notification recipients (participant + caregivers) for a televisit event
 * Returns an array of {recipient, locale} objects
 */
function getAllNotificationRecipients(televisitEvent) {
  const publicUser = televisitEvent.c_public_user
  const participantLocale = getLocale(televisitEvent)
  const recipients = []

  recipients.push({
    recipient: getRecipient(publicUser),
    locale: participantLocale
  })

  const relationshipCursor = org.objects.c_caregiver_relationships.find({
    c_client: publicUser._id
  })
    .expand(['c_caregivers_info.c_public_user'])
    .skipAcl()
    .grant(consts.accessLevels.read)

  if (relationshipCursor.hasNext()) {
    const relationship = relationshipCursor.next()
    const caregivers = relationship.c_caregivers_info || []

    caregivers.forEach(caregiver => {
      if (caregiver.c_public_user) {
        recipients.push({
          recipient: getRecipient(caregiver.c_public_user),
          locale: caregiver.c_public_user.c_locale || participantLocale
        })
      }
    })
  }

  return recipients
}

function templateVariablesForEvent(event, locale) {
  const accountId = (event.c_public_user && event.c_public_user.c_account) ? event.c_public_user.c_account._id : ''
  let accountInfo = {}
  if (accountId) {
    accountInfo = getAccountInfo(accountId)
  }
  const tz = (event.c_public_user && event.c_public_user.c_tz) ? event.c_public_user.c_tz : event.c_timezone,

        translatedTimeZone = new Intl.DateTimeFormat(
          locale.replace('_', '-'), {
            timeZone: tz,
            timeZoneName: 'long'
          })
          .formatToParts(event.c_start)
          .filter(o => o.type === 'timeZoneName')
          .pop()
          .value,

        time = new Intl.DateTimeFormat(
          locale.replace('_', '-'), {
            timeZone: tz,
            hour: 'numeric',
            minute: 'numeric'
          })
          .format(event.c_start),

        formattedDate = new Intl.DateTimeFormat(
          locale.replace('_', '-'), {
            dateStyle: 'full'
          })
          .format(event.c_start)

  return {
    account: accountInfo,
    date: formattedDate,
    time,
    timezone: translatedTimeZone
  }
}

/**
 * Sends an email to the participant associated with the event letting them
 * know that a new appointment has been scheduled.
 * Also sends notification to any caregivers if they exist.
 */
function sendVisitCreatedEmail(televisitEvent) {
  const recipients = getAllNotificationRecipients(televisitEvent)

  recipients.forEach(({ recipient, locale }) => {
    const templateVariables = templateVariablesForEvent(televisitEvent, locale)
    notifications.send(
      'c_axon_virtual_visit_new',
      templateVariables,
      {
        recipient,
        locale
      }
    )
  })
}

/**
 * Sends an email to the participant associated with the event letting them
 * know that their appointment has been rescheduled.
 * Also sends notification to any caregivers if they exist.
 */
function sendVisitRescheduledEmail(televisitEvent, oldEvent) {
  const recipients = getAllNotificationRecipients(televisitEvent)

  recipients.forEach(({ recipient, locale }) => {
    const templateVariables = {
      ...templateVariablesForEvent(televisitEvent, locale),
      oldVisit: {
        ...templateVariablesForEvent(oldEvent, locale)
      }
    }

    notifications.send(
      'c_axon_virtual_visit_rescheduled',
      templateVariables,
      {
        recipient,
        locale
      }
    )
  })
}

/**
 * Sends an email to the participant associated with the event letting them
 * know that their appointment has been canceled.
 * Also sends notification to any caregivers if they exist.
 */
function sendVisitCanceledEmail(televisitEvent) {
  const recipients = getAllNotificationRecipients(televisitEvent)

  recipients.forEach(({ recipient, locale }) => {
    const templateVariables = templateVariablesForEvent(televisitEvent, locale)
    notifications.send(
      'c_axon_virtual_visit_canceled',
      templateVariables,
      {
        recipient,
        locale
      }
    )
  })
}

/**
 * Sends an email to the participant associated with the event reminding them
 * that they have an upcoming visit.
 * Also sends notification to any caregivers if they exist.
 */
function sendVisitReminderEmail(televisitEvent) {
  const recipients = getAllNotificationRecipients(televisitEvent)

  recipients.forEach(({ recipient, locale }) => {
    const templateVariables = templateVariablesForEvent(televisitEvent, locale)
    notifications.send(
      'c_axon_virtual_visit_reminder',
      templateVariables,
      {
        recipient,
        locale
      }
    )
  })
}

/**
 * Sends an email to the participant associated with the event reminding them
 * have a visit starting in 15 minutes.
 * Also sends notification to any caregivers if they exist.
 */
function sendFifteenMinutesVisitReminderEmail(televisitEvent) {
  const recipients = getAllNotificationRecipients(televisitEvent)

  recipients.forEach(({ recipient, locale }) => {
    const templateVariables = templateVariablesForEvent(televisitEvent, locale)
    notifications.send(
      'c_axon_virtual_visit_15min_reminder',
      templateVariables,
      {
        recipient,
        locale
      }
    )
  })
}

/**
 * Sends an email to the participant associated with the event reminding them
 * have a visit starting in 5 minutes.
 * Also sends notification to any caregivers if they exist.
 */
function sendFiveMinutesVisitReminderEmail(televisitEvent) {
  const recipients = getAllNotificationRecipients(televisitEvent)

  recipients.forEach(({ recipient, locale }) => {
    const templateVariables = templateVariablesForEvent(televisitEvent, locale)
    notifications.send(
      'c_axon_virtual_visit_5min_reminder',
      templateVariables,
      {
        recipient,
        locale
      }
    )
  })
}

/**
 * Sends a push notification to the participant letting them know that they
 * have a visit starting in 15 minutes.
 * Also sends push notification to any caregivers if they exist.
 */
function send15MinuteReminderNotification(televisitEvent) {
  const recipients = getAllNotificationRecipients(televisitEvent)

  recipients.forEach(({ recipient, locale }) => {
    notifications.send('c_axon_virtual_visit_15m_reminder', {}, {
      recipient,
      locale
    })
  })
}

/**
 * Given an event, returns a list of c_reminder objects for that event.
 * c_reminder objects are used to trigger reminder notifications.
 *
 * if the event is more than 15 minutes in the future, add a 15m push notification.
 * if the event is more than 2 days in the future, add a 24hr email notification.
 */
function remindersForEvent(event) {
  const twoDays = moment.duration(2, 'days'),
        fifteenMinutes = moment.duration(15, 'minutes'),
        fiveMinutes = moment.duration(5, 'minutes'),
        start = event.c_start,
        timeUntilVisit = moment.duration(moment(start)
          .diff(moment())),
        reminders = []

  if (timeUntilVisit > twoDays) {
    reminders.push({
      c_reminder_type: '24hr_email',
      c_date: moment(start)
        .subtract(24, 'hours')
        .format()
    })
  }

  if (timeUntilVisit > fifteenMinutes) {
    reminders.push({
      c_reminder_type: '15m_push',
      c_date: moment(start)
        .subtract(15, 'minutes')
        .format()
    })
    reminders.push({
      c_reminder_type: '15min_email',
      c_date: moment(start)
        .subtract(15, 'minutes')
        .format()
    })
  }

  if (timeUntilVisit > fiveMinutes) {
    reminders.push({
      c_reminder_type: '5min_email',
      c_date: moment(start)
        .subtract(5, 'minutes')
        .format()
    })
  }

  return reminders
}

// Maps reminder types to functions that send them.
const REMINDER_TYPE_EXECUTORS = {
  '15m_push': send15MinuteReminderNotification,
  '24hr_email': sendVisitReminderEmail,
  '15min_email': sendFifteenMinutesVisitReminderEmail,
  '5min_email': sendFiveMinutesVisitReminderEmail
}

/**
 * Given an event, and a specific reminder, sends the reminder.
 */
function sendVirtualVisitReminder(televisitEvent, reminder) {
  const executor = REMINDER_TYPE_EXECUTORS[reminder.c_reminder_type]
  if (!executor) {
    logger.error(`Unknown reminder type: ${reminder.c_reminder_type} for event ${televisitEvent._id}.`)
    return
  }
  executor(televisitEvent)
}

/**
 * Given an televisit event and a specific reminder type, sends the email notification
 */
function sendTelevisitReminderEmail(event, reminderType) {
  const executor = REMINDER_TYPE_EXECUTORS[reminderType]
  if (!executor) {
    logger.error(`Unknown reminder type: ${reminderType} for event ${event._id}.`)
    return
  }
  executor(event)
}

/**
 * Send a missedCall notification
 */
function sendMissedVisitNotification(call) {
  const locale = getLocale(call)
  const recipient = getRecipient(call.c_public_user)
  notifications.send({
    type: 'missedCall'
  }, {
    endpoints: {
      push: {
        template: 'c_axon_virtual_visit_missed'
      }
    },
    recipient,
    locale
  })
}

/**
 * Cancels any existing reminders on an event
 */
function cancelAllReminders(event) {
  const reminderIds = event.c_reminders.map(v => v._id)
  console.log(`Event: ${event._id} has ${reminderIds.length} reminders`)
  if (reminderIds.length) {
    org.objects.c_event.updateOne({
      _id: event._id
    }, {
      $remove: {
        c_reminders: reminderIds
      }
    })
      .skipAcl()
      .grant(consts.accessLevels.update)
      .execute()
  }
}

module.exports = {
  sendVisitCreatedEmail,
  sendVisitRescheduledEmail,
  sendVisitCanceledEmail,

  sendVirtualVisitReminder,
  sendMissedVisitNotification,
  sendTelevisitReminderEmail,
  remindersForEvent,
  cancelAllReminders,
  sendVisitReminderEmail
}