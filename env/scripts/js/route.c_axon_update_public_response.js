/***********************************************************

@script     Axon - Update Public Response

@brief      Route to update public user task response

@body
    c_task_response: Task response object ID
    taskResponseData: Task response object data

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

if (!request.body.taskResponseData) {
  faults.throw('axon.invalidArgument.validTaskResponseRequired')
}

if (!request.body.taskResponseData.c_public_user) {
  faults.throw('axon.invalidArgument.taskResponseMustIncludeSubject')
}

try {
  publicUser = objects.read('c_public_users', request.body.taskResponseData.c_public_user)
} catch (err) {
  faults.throw('axon.invalidArgument.validSubjectRequired')
}

script.exit(objects.update('c_task_responses', request.body.c_task_response, request.body.taskResponseData))