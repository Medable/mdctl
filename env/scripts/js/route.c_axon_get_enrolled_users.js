/***********************************************************

@script     Axon - Get Enrolled Users

@brief      Route for getting list of accounts enrolled in
            participant group

@query
    groupids: array of participant group _ids

@author     Matt Lean     (Medable.MIL)

@version    4.2.0         (Medable.MIL)

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

var objects = require('objects'),
    request = require('request'),
    moment = require('moment.timezone')

// Overloading to have it return all enrolled users for a given
// study if that parameter is supplied
let studyId = request.query.studyid
if (studyId) {
  let defaultTz = org.tz || moment.tz.guess()
  var allGroups = org.objects.c_group
    .find({ c_study: studyId })
    .limit(1000)
    .map(g => g._id)
  return org.objects.account
    .find({ c_study_groups: { '$in': allGroups } })
    .skipAcl()
    .grant(7)
    .limit(5000)
    .map(acc => {
      acc.tzSpecifier = moment.tz(acc.tz || defaultTz).format('Z')
      acc.utcOffset = -moment.tz.zone(acc.tz || defaultTz).parse() * 60 * 1000
      return acc
    })
}

var groupIds = request.query.groupids || []

return objects.list('accounts', { where: { c_study_groups: { '$in': groupIds } }, limit: 1000, grant: 7, skipAcl: true })