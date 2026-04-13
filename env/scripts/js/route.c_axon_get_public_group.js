/***********************************************************

@script     Axon - Get Public Group

@brief    Get the public group and assigned tasks for user
            and study

@query
    c_study: c_study object ID
    c_public_user: c_public_user object ID

@author     Fiachra Matthews

@version    4.8.0

(c)2016-2019 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/
import faults from 'c_fault_lib'
import logger from 'logger'
import request from 'request'
import axonScriptLib from 'c_axon_script_lib'

const { c_group_tasks, c_steps, c_branches, c_studies } = org.objects
const singleImageTypes = ['instruction', 'image_capture', 'document_section', 'completion']

return script.as('c_system_user', { principal: { grant: consts.accessLevels.delete, skipAcl: true }, modules: { safe: false } }, () => {
  const study = c_studies.find({ _id: request.query.c_study })
    .include('c_localized_faults')
    .next()
  const group = axonScriptLib.findPublicGroup(study._id)

  if (!group) {
    faults.throw('axon.error.noGroupAndNoPublicGroup')
  }

  group.c_study = study
  group.c_group_tasks = c_group_tasks.find({ c_group: group._id })
    .expand('c_assignment')
    .toArray()
    .filter(v => v.c_assignment && v.c_assignment.object !== 'fault')
    .map(gt => {
      gt.c_assignment.c_branches = c_branches.find({ c_task: gt.c_assignment._id })
        .toArray()

      gt.c_assignment.c_steps = c_steps.find({ c_task: gt.c_assignment._id })
        .map(step => {

          if (singleImageTypes.includes(step.c_type) && step.c_image && step.c_image.path) {
            if (step.c_image.state !== 2) {
              step.c_image = {}
            }

          } else if (step.c_type === 'image_choice' && step.c_image_choices && Array.isArray(step.c_image_choices) && step.c_image_choices.length > 0) {
            step.c_image_choices = step.c_image_choices
              .filter(imCh => imCh.c_image && imCh.c_image.path && imCh.c_image.state === 2)
          }

          if (Array.isArray(step.c_assets) && step.c_assets.length > 0) {
            step.c_assets = step.c_assets
              .filter(currAsset => currAsset.c_file && currAsset.c_file.path && currAsset.c_file.state === 2)
          }

          return step
        })

      return gt
    })

  return group

})