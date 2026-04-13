/***********************************************************

 @script     Axon - signature: before.create

 @brief      Trigger to ensure signatures not created incorrectly

 @author     Fiachra Matthews

 (c)2020 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import logger from 'logger'
import nucUtils from 'c_nucleus_utils'
import request from 'request'
import faults from 'c_fault_lib'

// TODO: Remove in 4.15
let pathRegex = new RegExp('/c_site/([0-9a-fA-F]{24})/c_subjects/([0-9a-fA-F]{24})')
let match = request.path.match(pathRegex)
if (match) {
  let [,, c_public_user] = match
  if (request.body.c_review_status === 'Approved') {
    if (!nucUtils.canApprovePublicUser(c_public_user)) {
      faults.throw('axon.error.unapprovedTasksRemain')
    }
  }
}