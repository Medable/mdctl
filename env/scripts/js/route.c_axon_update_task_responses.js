/***********************************************************

@script     Axon - Update Task Responses

@brief		Route to update task responses in batch

@body
    taskResponses: array of c_task_response objects

@author     Matt Lean     (Medable.MIL)

@version    4.2.0         (Medable.MIL)

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

var objects = require('objects'),
    request = require('request');
    
var taskResponses = request.body.taskResponses;

var updatedTaskResponses = [];

for(var i=0; i < taskResponses; ++i) {
    var currTaskResponse = taskResponses[i];

    updatedTaskResponses.push(objects.update('c_task_response', currTaskResponse._id, currTaskResponse));
}

return updatedTaskResponses;