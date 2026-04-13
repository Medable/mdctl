/***********************************************************

@script     Axon - Update Step Orders

@brief      Route to re-order steps after sorting modification

@body
    stepOrders: ordered array of steps
    taskid: step task _id

@author     Matt Lean     (Medable.MIL)

@version    4.2.0         (Medable.MIL)

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/
import logger from 'logger'
import faults from 'c_fault_lib'

var objects = require('objects'),
    request = require('request')

var steps = request.body.stepOrders
var taskid = request.body.taskid

let stepsInfo = objects.list('c_steps',
  { where: { c_task: taskid, c_parent_step: null },
    paths: ['c_type'],
    limit: steps.length }).data

let stepType = Object.assign({}, ...stepsInfo.map(s => ({ [s._id]: s.c_type })))

let task = objects.read('c_task', taskid)
if (task.c_type === 'nucleus_consent') {
  let found = {}
  steps.forEach(s => {
    if (stepType[s._id] !== 'consent_review' && found['consent_review']) {
      faults.throw('axon.invalidArgument.noStepAfterReview')
    }

    if (found['initials'] && (stepType[s.id] === 'nucleus_question_review' ||
            stepType[s.id] === 'document_section')) {
      faults.throw('axon.invalidArgument.noReviewOrDocStepsAfterInitial')
    }

    if (found['nucleus_question_review'] && stepType[s.id] === 'document_section') {
      faults.throw('axon.invalidArgument.noDocStepsAfterReview')
    }

    found[stepType[s.id]] = true
  })

}

for (var i = 0; i < steps.length; ++i) {
  var currStep = steps[i]

  if (currStep.count !== '') {
    objects.update('c_steps', currStep.id, {
      c_order: currStep.count
    })
  }
}

return objects.list('c_steps', { where: { c_task: taskid, c_parent_step: null }, sort: { c_order: 1 }, limit: steps.length }).data