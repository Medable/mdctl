/***********************************************************

@script Axon - After Study Trigger

@brief Create default participant groups and generate
            pin after creating a study

@object     c_study

@on         After Create

@author     Matt Lean     (Medable.MIL)

@version    4.2.0         (Medable.MIL)

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import moment from 'moment'

const { orgs, c_groups: groups } = org.objects,
      pin = orgs.find({ _id: org._id })
        .paths('c_pin')
        .skipAcl()
        .grant(consts.accessLevels.read)
        .next().c_pin,
      seed = moment()
        .valueOf(),
      studyId = script.arguments.new._id

function random() {
  var x = Math.sin(seed + 1) * 10000
  return x - Math.floor(x)
}

function generateAccessCode() {
  var accessCode = ''
  var possibleChars = '0123456789'

  for (var i = 0; i < 4; ++i) {
    accessCode += possibleChars.charAt(Math.floor(random() * possibleChars.length))
  }

  return accessCode
}

// Create org exclusive pin if it doesn't exist
if (!pin) {
  orgs
    .updateOne({ _id: org._id }, {
      $set: { c_pin: generateAccessCode() }
    })
    .skipAcl()
    .grant(consts.accessLevels.update)
    .execute()
}

let allG = groups
  .insertOne({
    c_name: 'All', c_study: studyId, c_display_in_invite_list: true
  })
  .bypassCreateAcl()
  .execute()

let publicG = groups
  .insertOne({
    c_name: 'Public', c_study: studyId
  })
  .bypassCreateAcl()
  .execute()

org.objects.c_study
  .updateOne({ _id: studyId }, {
    $set: {
      c_public_group: publicG,
      c_default_subject_group: allG
    }
  })
  .skipAcl()
  .grant(consts.accessLevels.delete)
  .execute()