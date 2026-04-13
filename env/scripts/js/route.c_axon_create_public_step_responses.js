/***********************************************************

@script     Axon - Create Public Step Responses

@brief      Route for anonymously writing step responses

@body
 * stepResponses: Array of step response object data
 * c_public_user: ID of c_public_user

@author     Matt Lean     (Medable.MIL)

@version    4.3.2         (Medable.MIL)

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import faults from 'c_fault_lib'

var objects = require('objects'),
    request = require('request'),
    axonScriptLib = require('c_axon_script_lib')

if (!request.body.c_public_user) {
  faults.throw('axon.invalidArgument.validSubjectRequired')
}

if (!request.body.stepResponses) {
  faults.throw('axon.invalidArgument.validStepResponseRequired')
}

var publicUserId = request.body.c_public_user,
    stepResponseData = request.body.stepResponses,
    responseObject = {},
    stepResponses = [],
    study

var publicUser

try {
  objects.read('c_public_users', publicUserId, { grant: 7, skipAcl: true })
} catch (err) {
  faults.throw('axon.invalidArgument.validSubjectRequired')
}

if (stepResponseData.length > 0) {
  for (var i = 0; i < stepResponseData.length; ++i) {
    if (!stepResponseData[i].c_study) {
      study = study || require('objects').read('c_task', { _id: stepResponseData[i].c_task }, { paths: ['c_study._id'], throwNotFound: false }).c_study
      stepResponseData[i].c_study = study._id
    }

    let newStepResponse = objects.create('c_step_responses', stepResponseData[i], { grant: 7, skipAcl: true })
    stepResponses.push(newStepResponse)
  }
}

return stepResponses