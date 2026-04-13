/***********************************************************

@script     Axon - Get Enrollment Data

@brief      Retrieve enrollment data

@version    4.2.0

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import request from 'request'

const { c_study, start_datetime, end_datetime, type } = request.query

// eslint-disable-next-line no-throw-literal
if (!(type === 'joined' || type === 'left')) throw { code: 'kInvalidArgument', reason: 'Type must be "joined" or "left"' }
// eslint-disable-next-line no-throw-literal
if (!start_datetime || !end_datetime) throw { code: 'kInvalidArgument', reason: 'Start and end datetimes are required.' }

let enrollmentProp = `c_enrollments.c_${type}`,
    match = { 'c_enrollments.c_study': c_study, [enrollmentProp]: { '$gte': start_datetime, '$lte': end_datetime } }

return org.objects.account.aggregate()
  .match(match)
  .unwind('c_enrollments')
  .match(match)
  .project({ date: enrollmentProp })
  .skipAcl().grant(4).map(e => e.date)