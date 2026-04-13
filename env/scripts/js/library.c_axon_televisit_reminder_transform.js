/***********************************************************

 @script     Axon - Televisit Reminder Transform

 @brief      Exports a transform which can operate on a cursor of c_events.
             It will send and clear notifications as it reads events and will
             avoid any script limits in the process.  Any errors while sending
             notifications will be caught and logged.

 @author     Pete Richards

 (c)2020 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import { transform } from 'decorators-transform'
import logger from 'logger'

import { sendVirtualVisitReminder } from 'c_axon_televisit_notification_library'

// Returns the reminders that need to be sent for a given event.
function remindersToSend(event, date) {
  return event.c_reminders.filter(reminder => reminder.c_date <= date)
}

// Clears a reminder
function clearEventReminder(event, reminder) {
  org.objects.c_event.updateOne({
    _id: event._id
  }, {
    $remove: {
      c_reminders: [reminder._id]
    }
  })
    .skipAcl()
    .grant(consts.accessLevels.update)
    .execute()
}

// Sends reminders for a given event.
function sendEventReminders(event, date) {
  remindersToSend(event, date)
    .forEach(function(reminder) {
      sendVirtualVisitReminder(event, reminder)
      clearEventReminder(event, reminder)
    })
}

@transform
class TelevisitReminderTransform {

  beforeAll(memo) {
    Object.assign(memo, {
      now: new Date(),
      sent: 0,
      errors: 0,
      batches: 0
    })
  }

  before(memo) {
    memo.batches += 1
  }

  each(event, memo) {
    const beforeCount = script.getNotificationsRemaining()
    try {
      sendEventReminders(event, memo.now)
    } catch (error) {
      logger.error(`Failed to send reminders for event ${event._id}, error:`, error)
      memo.errors += 1
    }

    const afterCount = script.getNotificationsRemaining(),
          numberSent = beforeCount - afterCount

    memo.sent += numberSent

    if (afterCount <= 5) { // room for up to 5 notifications per event
      script.exit()
    }
  }

}

module.exports = TelevisitReminderTransform