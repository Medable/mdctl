/***********************************************************

@script     Axon - Get Public Response

@brief      Get the public task and step responses for a
            public user

@author     Matt Lean     (Medable.MIL)

@version    4.2.0         (Medable.MIL)

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/
import faults from 'c_fault_lib'

var objects = require('objects'),
    request = require('request')

var publicUser

try {
  publicUser = objects.read('c_public_users', request.query.c_public_user, { paths: ['_id'], grant: 7, skipAcl: true })
} catch (err) {
  faults.throw('axon.invalidArgument.validSubjectRequired')
}

var query = {
  grant: 7,
  skipAcl: true
}

if (request.query.query) {
  var requestQuery
  if (typeof request.query.query === 'string') {
    requestQuery = JSON.parse(request.query.query)
  } else {
    requestQuery = request.query.query
  }

  for (var key in requestQuery) {
    if (key === 'pipeline' || key === 'where' || key === 'sort') {
      query[key] = JSON.parse(requestQuery[key])
    } else {
      query[key] = requestQuery[key]
    }
  }
} else if (request.query.where) {
  query['where'] = JSON.parse(request.query.where)

  if (request.query.sort) {
    query['sort'] = JSON.parse(request.query.sort)
  }

  if (request.query.limit) {
    query['limit'] = request.query.limit
  }
} else if (request.query.c_task) {
  query['where'] = {
    $and: [
      { c_task: request.query.c_task },
      { c_public_user: publicUser._id }
    ]
  }
}

var taskResponses = objects.list('c_task_responses', query)

for (var i = 0; i < taskResponses.data.length; ++i) {
  var taskResponse = taskResponses.data[i]

  if (!taskResponse.c_public_user) {
    faults.throw('axon.accessDenied.taskResponseAccessDenied')
  } else if (String(taskResponse.c_public_user._id) !== request.query.c_public_user) {
    faults.throw('axon.accessDenied.taskResponseAccessDenied')
  }

  taskResponse.c_step_responses = objects.list('c_step_responses', { where: { c_task_response: taskResponse._id }, grant: 7, skipAcl: true })

  for (var j = 0; j < taskResponse.c_step_responses.length; ++j) {
    var stepResponse = taskResponse.c_step_responses[j]

    if (!stepResponse.c_public_user) {
      faults.throw('axon.accessDenied.stepResponseAccessDenied')
    } else if (String(stepResponse.c_public_user._id) !== request.query.c_public_user) {
      faults.throw('axon.accessDenied.stepResponseAccessDenied')
    }
  }
}

return taskResponses