/***********************************************************

@script     Axon - Verify Access Code

@brief      Verify a public user's access code.

@version    4.2.2

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import moment from 'moment'
import request from 'request'
import faults from 'c_fault_lib'

const { c_public_users } = org.objects
let { c_access_code, c_email, c_study } = request.body

if (!c_access_code) { faults.throw('axon.invalidArgument.validAccessCodeRequired') }
if (!c_email) { faults.throw('axon.invalidArgument.validEmailRequired') }
if (!c_study) { faults.throw('axon.invalidArgument.validStudyRequired') }

c_email = c_email.toLowerCase()

let publicUserCursor = c_public_users.find({ c_access_code, c_email, c_study }).skipAcl().grant(consts.accessLevels.read)
let publicUser = publicUserCursor.hasNext() && publicUserCursor.next()

if (publicUser) {
  if (publicUser.c_state !== 'verified' && publicUser.c_state !== 'authorized') {
    publicUser = c_public_users.updateOne({ _id: publicUser._id }, { '$set': { 'c_state': 'verified' } }).skipAcl().grant(consts.accessLevels.update).lean(false).execute()
  }

  script.exit(publicUser)
} else {
  faults.throw('axon.invalidArgument.validSubjectRequired')
}