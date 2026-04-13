/***********************************************************

 @script     Axon - c_call beforeCreate

 @brief      Sets default values for c_call, and creates and associates
  a Cortex Room with the c_call and sets other default values.

 @author     Pete Richards

  (c)2020 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import faults from 'c_fault_lib'

if (script.arguments.new.c_status !== 'starting') {
  script.arguments.new.update('c_status', 'starting')
}

const publicUser = org.objects.c_public_user
  .readOne({
    _id: script.arguments.new.c_public_user._id
  })
  .include('c_account._id', 'c_site._id')
  .execute()

if (!script.arguments.new.c_room) {

  if (!publicUser.c_account) {
    faults.throw('axon.invalidArgument.callsRequirePublicUserWithAccount')
  }

  const studyCursor = org.objects.c_studies.find()
    .limit(1)
    .skipAcl()
    .grant(consts.accessLevels.read)

  if (!studyCursor.hasNext()) {
    return faults.throw('axon.invalidArgument.validStudyRequired')
  }

  const study = studyCursor.next()
  const caregiverEnabled = study.c_caregiver_enabled === true
  const maxParticipants = caregiverEnabled ? 9 : 2

  let roomId = null

  try {
    // try to create room using v2 (Zoom) otherwise fallback to v1 (Twilio)
    roomId = org.objects.rooms
      .insertOne({
        acl: [
          `account.${script.arguments.new.creator._id}.update`,
          `account.${publicUser.c_account._id}.read`
        ],
        type: 'v2',
        configuration: {
          maxParticipants
        }
      })
      .bypassCreateAcl()
      .execute()
  } catch (e) {
    roomId = org.objects.rooms
      .insertOne({
        acl: [
          `account.${script.arguments.new.creator._id}.update`,
          `account.${publicUser.c_account._id}.read`
        ],
        configuration: {
          maxParticipants
        }
      })
      .bypassCreateAcl()
      .execute()
  }
  if (!roomId) {
    faults.throw('axon.invalidArgument.failedToCreateRoom')
  }

  script.arguments.new.update('c_room', roomId)
}

if (!script.arguments.new.c_site) {
  if (publicUser.c_site) {
    script.arguments.new.update('c_site', publicUser.c_site._id)
  }
}