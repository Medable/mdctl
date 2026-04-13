/***********************************************************

 @script     Axon - c_event After Create

 @brief      Sends a visit created email when visits are created.

 @author     Pete Richards

 (c)2020 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import { sendVisitCreatedEmail } from 'c_axon_televisit_notification_library'
import { TelevisitEventRuntimes } from 'c_axon_televisit_event_runtimes'

if (script.arguments.new.type !== 'c_televisit_event') {
  return
}

const event = org.objects.c_events.readOne({ _id: script.arguments.new._id })
  .skipAcl()
  .grant(consts.accessLevels.read)
  .include('c_public_user.c_account')
  .execute()

sendVisitCreatedEmail(event)
TelevisitEventRuntimes.addNewEventsForReminder(event)