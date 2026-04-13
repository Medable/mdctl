/***********************************************************

@script     Nucleus - Account Public Identifier Update

@brief      Trigger to create a public identifier depending on a cache entry

@author     Fiachra Matthews

@version    1.0.0

(c)2018-2014 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/
import nucUtils from 'c_nucleus_utils'
import cache from 'cache'
import logger from 'logger'

if (script.arguments.new.roles && script.arguments.new.roles.map(v => v.toString())
  .includes(consts.roles.c_study_participant.toString())) {
  return
}

let data = cache.get('nucleus:publicIdentifierPattern')

if (data) {
  if (data.type === 'name') {
    const idString = nucUtils.getNameIDStringFromPattern(script.arguments.new, data.value)
    script.arguments.new.update({ c_public_identifier: idString })
  }
}