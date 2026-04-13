/***********************************************************

 @script     Axon - Room Event Library

 @brief      Defines handlers for Cortex-specific room events, which are used
             to implement one-to-one video calls on top of the Cortex Room.

 @author     Pete Richards

 @exports    handleParticipantEvent(room, event)
 @exports    handleRoomEvent(room, event)

 (c)2020 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import notifications from 'notifications'

/**
 * Finds the c_call associated with a room, and sends an incoming call
 * notification to the public user associated with the c_call.
 */
function sendIncomingCallNotification(room) {
  const call = org.objects.c_calls
          .readOne({ c_room: room._id })
          .include('c_public_user')
          .include('creator')
          .skipAcl()
          .grant(consts.accessLevels.read)
          .execute(),
        publicUser = org.objects.c_public_user
          .readOne({ _id: call.c_public_user._id })
          .include('c_account')
          .skipAcl()
          .grant(consts.accessLevels.read)
          .execute(),
        publicUserRoom = script.as(publicUser.c_account._id, () => {
          return org.objects.rooms.readOne({ _id: room._id })
            .execute()
        }),
        creator = org.objects.accounts
          .readOne({ _id: call.creator._id })
          .include('name')
          .skipAcl()
          .grant(consts.accessLevels.read)
          .execute(),
        payload = {
          type: 'callStart',
          roomId: room._id.toString(),
          twilioToken: publicUserRoom.token,
          name: creator.name
        },
        options = {
          endpoints: {
            push: {
              message: 'callStart',
              fcm: {

              },
              apn: {
                topics: ['voip'],
                pushType: 'voip',
                priority: '10',
                expiration: 0
              }
            }
          },
          recipient: publicUser.c_account
        }

  notifications.send(payload, options)
}

/**
 * Ends the c_call associated with a room.  Triggers on c_call are responsible
 * for closing the room.
 */
function endCall(room) {
  org.objects.c_calls
    .updateOne({
      c_room: room._id
    }, {
      $set: { c_status: 'finished' }
    })
    .skipAcl()
    .grant(consts.accessLevels.update)
    .execute()
}

/**
 * handles participant events.
 *
 * When the first user (the caller) joins a room, sends an incoming call
 * notification to the callee.
 *
 * When any user disconnects from a Room, ends the associated call.
 */
function handleParticipantEvent(room, event) {
  if (event.name === 'connected' && room.participants.length === 1) {
    sendIncomingCallNotification(room)
  } else if (event.name === 'disconnected') {
    endCall(room)
  }
}

/**
 * Send a roomReady notification to the creator of a call.
 */
function sendRoomReadyNotification(room) {
  const providerRoom = script.as(room.creator._id, () => {
          return org.objects.rooms.readOne({ _id: room._id })
            .execute()
        }),
        call = org.objects.c_calls
          .readOne({ c_room: room._id })
          .skipAcl()
          .grant(consts.accessLevels.read)
          .execute(),
        payload = {
          type: 'roomReady',
          roomId: room._id.toString(),
          twilioToken: providerRoom.token
        },
        options = {
          endpoints: {
            push: {
              message: 'roomReady'
            }
          },
          recipient: call.creator
        }

  notifications.send(payload, options)
}

/**
 * Handles room events, updating call status based on room events, and notifying
 * callers when the room is ready is ready for them to join.
 */
function handleRoomEvent(room, event) {
  if (event.name === 'created') {
    org.objects.c_calls
      .updateOne({
        c_room: room._id
      }, {
        $set: { c_status: 'open' }
      })
      .skipAcl()
      .grant(consts.accessLevels.update)
      .execute()

    sendRoomReadyNotification(room)
  } else if (event.name === 'ended') {
    org.objects.c_calls
      .updateOne({
        c_room: room._id
      }, {
        $set: { c_status: 'finished' }
      })
      .skipAcl()
      .grant(consts.accessLevels.update)
      .execute()
  }
}

module.exports = {
  handleParticipantEvent,
  handleRoomEvent
}