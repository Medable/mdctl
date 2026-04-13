/***********************************************************

@script     Account After Update, Public User updates

@brief      Trigger to update related public users on account updates

@author     Fiachra Matthews

@version    1.0.0

(c)2016-2018 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import logger from 'logger'
import _ from 'underscore'
import c_nuc_utils from 'c_nucleus_utils'

import request from 'request'
import cache from 'cache'

// if the  change that  triggered this was the
// update on locales or timezones then we
// don't run this logic
let cacheKey = `locTZUpdate-${request._id}`
if (cache.has(cacheKey)) {
  return
}

let account = script.as(script.principal, { principal: { grant: consts.accessLevels.read, skipAcl: true } }, () => {
  let acc
  try {
    acc = org.objects.accounts.find({ _id: script.arguments.old._id })
      .paths('c_public_users._id')
      .passive()
      .next()
  } catch (err) {

  }

  return acc
})

if (account && account.c_public_users && account.c_public_users.data.length > 0) {
  account.c_public_users.data.forEach(v => {
    c_nuc_utils.setPublicuserSearchTerms(v._id)
    c_nuc_utils.setPublicuserNameEmail(v._id)
  })
}