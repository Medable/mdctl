/***********************************************************

 @script     Axon - c_event Before Create set defaults

 @brief      Sets default values for televisit events and performs validation,
             ensuring that events are only associated with public users that
             have accounts.

 @author     Pete Richards

 (c)2020 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import { remindersForEvent } from 'c_axon_televisit_notification_library'
import faults from 'c_fault_lib'

console.log('-----create Event Before-----')
if (script.arguments.new.type !== 'c_televisit_event') {
  return
}

if (script.arguments.new.c_public_user) {
  const publicUser = org.objects.c_public_users.readOne({ _id: script.arguments.new.c_public_user._id })
    .skipAcl()
    .grant(consts.accessLevels.read)
    .paths('c_account', 'c_email', 'c_tz')
    .execute()

  if (!publicUser.c_account && !publicUser.c_email) {
    faults.throw('axon.invalidArgument.eventsRequirePublicUserWithAccountOrEmail')
  }

  if (!script.arguments.new.c_timezone) {
    const c_timezone = publicUser.c_tz || 'UTC'
    script.arguments.new.update({ c_timezone })

  }
}

if (!script.arguments.new.c_reminders || !script.arguments.new.c_reminders.length) {
  const reminders = remindersForEvent(script.arguments.new)
  script.arguments.new.update('c_reminders', reminders)
}