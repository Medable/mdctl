/***********************************************************

@script     Axon - Create Public Task Response

@brief    Route for anonymously writing task responses

@body
    taskResponse: Task response object data

@author     Matt Lean     (Medable.MIL)

@version    4.3.2         (Medable.MIL)

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import axonScriptLib from 'c_axon_script_lib'
import { body } from 'request'

const { c_public_users, c_task_responses } = org.objects

const taskResponse = body.taskResponse

if (!taskResponse) {
  faults.throw('axon.invalidArgument.validTaskResponseRequired')
}

if (!taskResponse.c_public_user) {
  faults.throw('axon.invalidArgument.taskResponseMustIncludeSubject')
}

if (body.c_public_user && (body.c_public_user !== taskResponse.c_public_user)) {
  faults.throw('axon.invalidArgument.validSubjectRequired')
}

const publicUser = taskResponse.c_public_user || body.c_public_user

try {
  c_public_users.find({ _id: publicUser }).grant(7).skipAcl().next()
} catch (err) {
  faults.throw('axon.invalidArgument.validSubjectRequired')
}

return c_task_responses.insertOne(taskResponse).lean(false).grant(7).skipAcl().execute()