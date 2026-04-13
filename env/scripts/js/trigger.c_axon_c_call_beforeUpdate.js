/***********************************************************

 @script     Axon - c_call beforeUpdate

 @brief      Whenever a c_call's status is changed to finished, find the Cortex
             Room associated with the call and close it.  Additionally, if the
             call recipient did not join the call, it will send a missedCall
             notification.

 @author     Pete Richards

 (c)2020 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import { sendMissedVisitNotification } from 'c_axon_televisit_notification_library'

if (script.arguments.new.c_status !== 'finished') {
  return
}

const call = org.objects.c_calls
  .readOne({
    _id: script.arguments.new._id
  })
  .paths('c_status', 'c_room', 'c_public_user.c_account')
  .execute()

if (call.c_status === 'finished') {
  return
}

const room = org.objects.rooms.readOne({
  _id: call.c_room._id
})
  .execute()

if (room.state === 'closed') {
  return
}

org.objects.rooms
  .updateOne({
    _id: call.c_room._id
  }, {
    $set: { state: 'closed' }
  })
  .execute()

const recipient = call.c_public_user.c_account,
      recipientJoinedRoom = room.participants.some(p => p.account._id.equals(recipient._id))

if (recipientJoinedRoom) {
  return
}

sendMissedVisitNotification(call)