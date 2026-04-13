/***********************************************************

 @script     Axon - c_event Before Update

 @brief      Updates reminders when events are rescheduled.

 @author     Pete Richards

 (c)2020 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import { remindersForEvent } from 'c_axon_televisit_notification_library'

if (script.arguments.new.type !== 'c_televisit_event') {
  return
}

if (script.arguments.new.c_start && script.arguments.new.c_start !== script.arguments.old.c_start) {
  const reminders = remindersForEvent(script.arguments.new)
  script.arguments.new.update('c_reminders', reminders)
}