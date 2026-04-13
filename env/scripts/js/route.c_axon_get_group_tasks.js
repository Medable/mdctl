/***********************************************************

@script     Axon - Get Group Tasks

@brief      Route for getting list of group tasks by study

@query
    c_study: c_study _id

@author     Matt Lean     (Medable.MIL)
            Tim Smith     (Medable.TRS)

@version    4.3.1         (Medable.MIL)

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/
import { query } from 'request'
import objects from 'objects'
import logger from 'logger'
import _ from 'underscore'
import faults from 'c_fault_lib'

function getFilePath(path) {
  var queryPath = path.split('/')
  queryPath.splice(0, 2)
  return queryPath.join('/')
}

const { c_study: studyId } = query

if (!studyId) {
  faults.throw('axon.invalidArgument.validStudyRequired')
}

let accountStudyGroups = objects.read('accounts', script.principal._id, { paths: ['c_study_groups'] }).c_study_groups,
    groups = objects.list('c_groups', { where: { 'c_study': studyId, '_id': { '$in': accountStudyGroups } }, paths: ['_id'], skipAcl: true, grant: 4 }),
    groupId

if (groups.data.length < 1) {
  faults.throw('axon.error.noEnrolledGroupFound')
} else {
  groupId = groups.data[0]._id
}

let groupTasks = objects.list('c_group_tasks', { where: { 'c_group': groupId }, limit: 100, skipAcl: true, grant: 4 })

groupTasks.data.forEach(function(groupTask) {
  let assignment = objects.read('c_tasks', groupTask.c_assignment._id, { grant: 4 })
  assignment.c_steps = objects.list('c_steps', { sort: { 'c_order': 1 }, where: { 'c_task': groupTask.c_assignment._id }, limit: 1000, skipAcl: true, grant: 4 })

  assignment.c_steps.data.forEach(step => {

    if ((step.c_type === 'instruction' || step.c_type === 'image_capture' || step.c_type === 'document_section') && step.c_image && step.c_image.path) {
      step.c_image = step.c_image.state === 2
        ? { ...objects.read('c_steps', getFilePath(step.c_image.path), { grant: 7, skipAcl: true }), path: step.c_image.path }
        : {}
    } else if (step.c_type === 'image_choice' && step.c_image_choices && Array.isArray(step.c_image_choices) && step.c_image_choices.length > 0) {
      step.c_image_choices = _(step.c_image_choices)
        // eslint-disable-next-line eqeqeq
        .filter(currImageChoice => currImageChoice.c_image && currImageChoice.c_image.path && currImageChoice.c_image.state == 2)
        .map(currImageChoice => {
          currImageChoice.c_image = { ...objects.read('c_steps', getFilePath(currImageChoice.c_image.path), { grant: 7, skipAcl: true }),
            path: currImageChoice.c_image.path }
          return currImageChoice
        })
    }

    if (Array.isArray(step.c_assets) && step.c_assets.length > 0) {
      step.c_assets = _(step.c_assets)
        // eslint-disable-next-line eqeqeq
        .filter(currAsset => currAsset.c_file && currAsset.c_file.path && currAsset.c_file.state == 2)
        .map(currAsset => {
          currAsset.c_file = { ...objects.read('c_steps', getFilePath(currAsset.c_file.path), { grant: 7, skipAcl: true }),
            path: currAsset.c_file.path }
          return currAsset
        })
    }

  })

  assignment.c_branches = objects.list('c_branches', { where: { 'c_task': groupTask.c_assignment._id }, limit: 100, skipAcl: true, grant: 4 })

  groupTask.c_assignment = assignment
})

return groupTasks