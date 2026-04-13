/***********************************************************

 @script     Axon - room onParticipantEvent

 @brief      Uses the axon room event library to handle participant events.

 @author     Pete Richards

 (c)2020 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import { handleParticipantEvent } from 'c_axon_room_event_library'

const { arguments: { event, old: room } } = script

handleParticipantEvent(room, event)