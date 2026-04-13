import { remindersForEvent, sendTelevisitReminderEmail, sendVirtualVisitReminder } from 'c_axon_televisit_notification_library'
import {
  route,
  log,
  trigger,
  on,
  job,
  as
} from 'decorators'
import { transform } from 'decorators-transform'
import logger from 'logger'
import moment from 'moment'

const { Events, c_event, c_public_user } = org.objects
const { accessLevels } = consts

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
class TelevisitEventRuntimes {

    @log({ traceError: true })
    @trigger('update.before', {
      object: 'c_event',
      active: true,
      weight: 0.7,
      principal: 'c_system_user',
      if: {
        $eq: [
          '$$ROOT.type',
          'c_televisit_event'
        ]
      }
    })
  static eventBeforeUpdate() {
    if (script.arguments.new.type !== 'c_televisit_event') {
      return
    }
    if (script.arguments.new.c_start && script.arguments.new.c_start !== script.arguments.old.c_start) {
      const newReminders = remindersForEvent(script.arguments.new)
      script.arguments.new.update('c_reminders', newReminders)
    }
  }

    @log({ traceError: true })
    @on('c_televisit_reminder', { name: 'c_televisit_reminder' })
    static sendTelevisitReminder({ event, reminder_type }) {
      sendTelevisitReminderEmail(event, reminder_type)
    }

    static addNewEventsForReminder(event) {
      const reminders = event.c_reminders,
            publicUser = c_public_user.find({ _id: event.c_public_user._id })
              .next()
      reminders.forEach((reminder) => {
        Events.insertOne({
          type: 'script',
          event: 'c_televisit_reminder',
          key: `${event._id}_${reminder.c_reminder_type}_${moment(reminder.c_date)
            .toISOString()}`,
          param: {
            event,
            reminder_type: reminder.c_reminder_type
          },
          principal: ((publicUser.c_account && publicUser.c_account._id) || script.principal._id),
          start: moment(reminder.c_date)
            .toISOString()
        })
          .bypassCreateAcl()
          .grant(accessLevels.update)
          .execute()
      })
    }

    static clearExistingEventReminder(event) {
      const eventReminders = event.c_reminders.reduce((result, reminder) => {
        result.push(`${event._id}_${reminder.c_reminder_type}_${moment(reminder.c_date)
          .toISOString()}`)
        return result
      }, [])
      if (eventReminders.length > 0) {
        Events.deleteMany({ key: { $in: eventReminders } })
          .skipAcl()
          .grant(consts.accessLevels.delete)
          .execute()
      }
    }

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

module.exports = { TelevisitReminderTransform, TelevisitEventRuntimes }