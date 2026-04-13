/***********************************************************

@script     Axon - Create Public User

@brief      Route for anonymously creating public user

@body
    publicUser: public user payload

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

var study

if (!request.body.publicUser) {
  faults.throw('axon.invalidArgument.validSubjectRequired')
}

if (!request.body.publicUser.c_study) {
  faults.throw('axon.invalidArgument.subjectRequiresStudy')
}

try {
  study = objects.read('c_studies', request.body.publicUser.c_study)
} catch (err) {
  faults.throw('axon.invalidArgument.validStudyRequired')
}

if (!study.c_limit_enroll) {
  return objects.create('c_public_users', request.body.publicUser)
}

throw axonScriptLib.genError('You cannot create a public user through this endpoint for a limited enrollment study. You must invite the user instead.', 400)