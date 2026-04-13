/***********************************************************

 @script     Axon - Get Study Task Assets

 @brief      Get assets for tasks in the study.  Assets are returned with
             authorized read urls for AWS so they can be immediately downloaded.

             Permissions:
             * unauthorized users: returns assets for tasks in the public group.
             * enrolled users: returns assets for tasks in their current group.
             * site users: returns all assets for study.
             * other user: returns 404.

 @author     Pete Richards

 @query

    c_study: study id, required. the study to get task assignments for

 (c)2019 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import _ from 'underscore'
import request from 'request'
import { isIdFormat } from 'util.id'
import { principals, accessLevels } from 'consts'
import { AdvanceTaskScheduling } from 'c_axon_adv_task_scheduler'

import faults from 'c_fault_lib'
import axonScriptLib from 'c_axon_script_lib'
import nucUtils from 'c_nucleus_utils'
const { runnerIsAdmin } = require('c_nucleus_utils')

const { c_studies, c_steps, c_tasks } = org.objects,
      { c_study, c_public_user } = request.query

if (!isIdFormat(c_study)) {
  faults.throw('axon.invalidArgument.validStudyRequired')
}

const study = c_studies.readOne({ _id: c_study })
  .skipAcl()
  .grant(consts.accessLevels.read)
  .paths('_id', 'c_use_advanced_task_scheduler')
  .throwNotFound(false)
  .execute()

if (!study) {
  faults.throw('axon.invalidArgument.validStudyRequired')
}

function isSiteUser() {
  let siteUser = false
  if (!nucUtils.isNewSiteUser(script.principal.roles)) {
    const siteIds = org.objects.c_sites.find({ c_study })
      .paths('_id')
      .map(site => site._id)

    siteUser = org.objects.c_site_users
      .readOne({
        c_account: script.principal._id,
        c_site: { $in: siteIds }
      })
      .paths('_id')
      .skipAcl()
      .grant(accessLevels.read)
      .throwNotFound(false)
      .execute() // will throw if no match found.
  } else {
    const { c_site_access_list: siteAccessList } = org.objects.accounts.find({ _id: script.principal._id })
      .paths('c_site_access_list')
      .next()
    siteUser = siteAccessList.length
  }

  return !!siteUser
}

function publicUserForCurrentPrincipal() {
  return org.objects.c_public_users
    .find({
      c_account: script.principal._id
    })
    .skipAcl()
    .grant(accessLevels.read)
    .filter(pu => pu.c_study._id.equals(c_study))[0]
}

/* ATS Validation and parameters:
  * Anonymous users without public user get error ('must specify public user').
  * Anonymous users with public user id return assets for their assignments.
  * Enrolled subjects get assets for their assignments.
  * Site users get assets for all assigned groups.
*/
function validatedATSParameters() {
  if (script.principal._id.equals(principals.anonymous)) {
    // Anonymous calls require valid unregistered public user.
    if (!isIdFormat(c_public_user)) {
      faults.throw('axon.invalidArgument.validSubjectRequired')
    }

    const publicUser = org.objects.c_public_users.readOne(c_public_user)
      .skipAcl()
      .grant(accessLevels.read)
      .throwNotFound(false)
      .execute()

    if (!publicUser || publicUser.c_account) {
      faults.throw('axon.invalidArgument.validSubjectRequired')
    }

    return {
      publicUser
    }
  }

  const publicUser = publicUserForCurrentPrincipal()
  if (publicUser) {
    return {
      publicUser
    }

  }

  if (isSiteUser()) {
    return {
      isSiteUser: true
    }
  }
}

/* Legacy validation and parameters:
  * Anonymous users only get assets for public group.
  * Enrolled subjects get assets for their current group.
  * Site users get assets for all assigned groups.
  * Anyone else gets a 404.
*/
function validatedLegacyParameters() {
  if (script.principal._id.equals(principals.anonymous)) {
    return {
      legacy: true,
      groupId: axonScriptLib.findPublicGroup(c_study)._id
    }
  }

  const publicUser = publicUserForCurrentPrincipal()
  if (publicUser) {
    return {
      legacy: true,
      groupId: publicUser.c_group._id
    }
  }

  if (isSiteUser()) {
    return {
      legacy: true,
      isSiteUser: true
    }
  }
}

// Get validated parameters for the route.  Will throw a fault if the route is called with invalid parameters.
function validatedParameters() {
  const defaultParams = study.c_use_advanced_task_scheduler ? validatedATSParameters() : validatedLegacyParameters()

  return {
    ...defaultParams,
    isAdminUser: runnerIsAdmin()
  }
}

// Given a study id, return all task ids which have been assigned to a group in
// that study i.e. all tasks which are potentially available to a site app user.
function getAssignedTaskIds(studyId) {
  const projection = {
    c_name: 1,
    c_groups: {
      $expand: {
        limit: 1000,
        pipeline: [{
          $project: {
            c_name: true,
            c_group_tasks: {
              $expand: {
                limit: 200,
                paths: ['c_assignment._id']
              }
            }
          }
        }]
      }
    }
  }

  const study = script.as(nucUtils.SystemUser.name, function() {
    return c_studies.aggregate()
      .skipAcl()
      .grant(accessLevels.read)
      .match({ _id: studyId })
      .project(projection)
      .next()
  })

  const studyGroupTasks = _.chain(study.c_groups.data)
    .map(group => group.c_group_tasks.data)
    .flatten()
    .map(group_task => group_task.c_assignment._id.toString())
    .value()

  return _.uniq(studyGroupTasks)
}

// returns ids of all tasks assigned to a specific group.
function getGroupTaskIds(groupId) {
  return org.objects.c_group_tasks.find({ c_group: groupId })
    .paths('c_assignment._id')
    .skipAcl()
    .grant(accessLevels.read)
    .limit(100)
    .map(groupTask => groupTask.c_assignment._id.toString())
}

// Returns ids of all tasks assigned to a participant's schedules.
function getTaskIdsFromParticipantSchedules(publicUserId) {
  return AdvanceTaskScheduling.getParticipantTaskIds(publicUserId)
}

// Returns an array containing all assets for a given step.
function getStepAssets(step) {
  const locale = (script.locale || 'en_US').toLowerCase()
  const assets = []
  if (step.c_image && step.c_image.path) {
    assets.push(step.c_image)
  }
  if (Array.isArray(step.c_assets)) {
    step.c_assets.forEach(i => {
      const asset = i.c_file
      asset.identifier = (i.c_identifier || '').toString()
      if (asset.identifier.toLowerCase()
        .startsWith('ecoalocalization')) {
        if (asset.identifier.toLowerCase()
          .includes(locale)) {
          assets.push(asset)
        }
      } else {
        assets.push(asset)
      }
    })
  }
  if (Array.isArray(step.c_image_choices)) {
    assets.push(...step.c_image_choices.map(i => i.c_image))
  }
  return assets.filter(file => (file && file.state === 2))
    .map(file => {
      file.stepId = step._id.toString()
      return file
    })
}

function getAssetsFromTaskIds(taskIds) {
  const steps = c_steps
    .find({
      c_task: { $in: taskIds },
      c_type: { $in: ['document_section', 'image_capture', 'image_choice', 'instruction', 'web_view', 'webview_form', 'completion'] }
    })
    .skipAcl()
    .grant(4)
    .include('c_image.content')
    .passive()
    .map(step => step)

  const taskAssets = c_tasks
    .find({
      _id: { $in: taskIds },
      c_type: { $in: ['web_form'] }
    })
    .skipAcl()
    .grant(accessLevels.read)
    .include('c_html_bundle.content')
    .passive()
    .filter(({ c_html_bundle }) => c_html_bundle)
    .map(task => {
      const asset = task.c_html_bundle
      asset.taskId = task._id.toString()
      return asset
    })

  // TODO: use .flatMap when supported by cortex scripts
  return _.flatten(steps.map(getStepAssets)
    .concat(taskAssets))
}

const parameters = validatedParameters()

if (parameters.legacy && parameters.groupId) {
  return getAssetsFromTaskIds(getGroupTaskIds(parameters.groupId))
}

if (parameters.isSiteUser || parameters.isAdminUser) {
  return getAssetsFromTaskIds(getAssignedTaskIds(study._id))
}

if (parameters.publicUser) {
  return getAssetsFromTaskIds(getTaskIdsFromParticipantSchedules(parameters.publicUser._id))
}

faults.throw('cortex.accessDenied.instanceRead')