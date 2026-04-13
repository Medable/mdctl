/***********************************************************

@script     Axon - Create Default Authentication Task Steps

@brief      Trigger for scaffolding out default authentication
            task form steps

@object     c_task

@on         After Create

@author     Matt Lean     (Medable.MIL)

@version    4.2.0         (Medable.MIL)

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import faults from 'c_fault_lib'
import _ from 'underscore'
import objects from 'objects'

if (script.arguments.new.c_type === 'authentication') {
  const authFormStep = objects.create('c_steps', {
    c_name: 'Authentication Form Step',
    c_text: 'Authentication Form Step',
    c_optional: false,
    c_type: 'form',
    c_task: script.arguments.new._id,
    c_order: 0
  })
  const studyCursor = org.objects.c_studies.find()
    .limit(1)
    .skipAcl()
    .grant(consts.accessLevels.read)
  if (!studyCursor.hasNext()) {
    return faults.throw('axon.invalidArgument.validStudyRequired')
  }
  const study = studyCursor.next()
  const authFields = study.c_auth_task_fields
  if (Array.isArray(authFields) && authFields.length) {
    authFields.forEach(authField => createAuthSubStep(authFormStep, authField))
  } else {
    createAuthSubStep(authFormStep, 'all')
  }
}

function createAuthSubStep(authFormStep, authField) {
  const steps = stepsFactory(authFormStep, authField)
  if (Array.isArray(steps)) {
    steps.forEach(step => objects.create('c_steps', step))
  } else {
    objects.create('c_steps', steps)
  }
}

function stepsFactory(authFormStep, authField) {
  const stepsMap = {
    name: [
      {
        c_name: 'First Name Text Step',
        c_text: 'First Name',
        c_optional: false,
        c_multiple_lines: false,
        c_type: 'text',
        c_task: script.arguments.new._id,
        c_parent_step: String(authFormStep._id),
        c_order: 0,
        c_account_map: 'name.first'
      },
      {
        c_name: 'Last Name Text Step',
        c_text: 'Last Name',
        c_optional: false,
        c_multiple_lines: false,
        c_type: 'text',
        c_task: script.arguments.new._id,
        c_parent_step: String(authFormStep._id),
        c_order: 1,
        c_account_map: 'name.last'
      }
    ],
    username: {
      c_name: 'Username Step',
      c_text: 'Username',
      c_optional: false,
      c_type: 'text',
      c_task: script.arguments.new._id,
      c_parent_step: String(authFormStep._id),
      c_order: 2,
      c_account_map: 'username'
    },
    email: {
      c_name: 'Email Step',
      c_text: 'Email',
      c_optional: false,
      c_type: 'email',
      c_task: script.arguments.new._id,
      c_parent_step: String(authFormStep._id),
      c_order: 3,
      c_account_map: 'email'
    },
    password: {
      c_name: 'Password Text Step',
      c_text: 'Password',
      c_optional: false,
      c_multiple_lines: false,
      c_secure_text_entry: true,
      c_require_validation: true,
      c_type: 'text',
      c_task: script.arguments.new._id,
      c_parent_step: String(authFormStep._id),
      c_order: 4,
      c_account_map: 'password'
    },
    mobile: {
      c_name: 'Mobile Phone Text Step',
      c_text: 'Mobile Phone',
      c_optional: false,
      c_multiple_lines: false,
      c_type: 'text',
      c_task: script.arguments.new._id,
      c_parent_step: String(authFormStep._id),
      c_order: 5,
      c_account_map: 'mobile'
    },
    dob: {
      c_name: 'Date of Birth Datetime Step',
      c_text: 'Date of Birth',
      c_optional: false,
      c_calendar: 'Gregorian',
      c_date_only: true,
      c_type: 'datetime',
      c_task: script.arguments.new._id,
      c_parent_step: String(authFormStep._id),
      c_order: 6,
      c_account_map: 'dob'
    }
  }
  return authField === 'all' ? _.flatten(_.values(stepsMap)) : stepsMap[authField]
}