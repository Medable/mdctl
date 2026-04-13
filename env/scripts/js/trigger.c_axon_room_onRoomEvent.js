/***********************************************************

 @script     Axon - room onRoomEvent

 @brief      Uses the axon room event library to handle room events.

 @author     Pete Richards

 (c)2020 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import { handleRoomEvent } from 'c_axon_room_event_library'

const { arguments: { event, old: room } } = script

handleRoomEvent(room, event)