/***********************************************************

 @script     Axon - c_event After Update

 @brief      Sends emails when events are canceled or rescheduled.

 @author     Pete Richards

 (c)2020 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import { sendVisitRescheduledEmail, sendVisitCanceledEmail, cancelAllReminders, remindersForEvent } from 'c_axon_televisit_notification_library'
import { TelevisitEventRuntimes } from 'c_axon_televisit_event_runtimes'

if (script.arguments.new.type !== 'c_televisit_event') {
  return
}

const event = org.objects.c_events.readOne({ _id: script.arguments.new._id })
  .skipAcl()
  .grant(consts.accessLevels.read)
  .include('c_public_user.c_account')
  .execute()

if (script.arguments.new.c_canceled && !script.arguments.old.c_canceled) {
  sendVisitCanceledEmail(event)
  TelevisitEventRuntimes.clearExistingEventReminder(event)
  cancelAllReminders(event)
  return
}

if (script.arguments.new.c_start && script.arguments.new.c_start !== script.arguments.old.c_start) {
  sendVisitRescheduledEmail(event, script.arguments.old)
  TelevisitEventRuntimes.clearExistingEventReminder(script.arguments.old)
  TelevisitEventRuntimes.addNewEventsForReminder(event)
}