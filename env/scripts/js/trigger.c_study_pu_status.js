/***********************************************************

@script     Axon - Study trigger to manage Public user status
            updates

@brief      We need to see if a status was removed from the
            c_study.c_subject_status_list and if so we need
            to remove it from any tasks that set it. It also
            needs to be removed as the enrollment status if set

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

/* eslint-disable camelcase, one-var */

import logger from 'logger'
import _ from 'underscore'

const { c_tasks, c_studies } = org.objects

if (_.contains(script.arguments.modified, 'c_subject_status_list')) {
  let oldStatusList = script.arguments.old.c_subject_status_list,
      newStatusList = script.arguments.new.c_subject_status_list

  if (oldStatusList.length > newStatusList.length) {
    let removedStatus = oldStatusList.filter(v => {
          return !newStatusList.find(s => s.c_status_value === v.c_status_value)
        }),
        tasks = c_tasks.find({ c_study: script.arguments.new._id })
          .paths('c_set_subject_status_success', 'c_set_subject_status_failure', 'c_name')
          .limit(200)
          .toArray(),
        study = c_studies.find({ _id: script.arguments.new._id })
          .paths('c_subject_enrollment_status')
          .next()

    removedStatus.forEach(status => {
      if (study.c_subject_enrollment_status === status.c_status_value) {
        c_studies.updateOne({ _id: script.arguments.new._id }, { $unset: { c_subject_enrollment_status: 1 } })
          .execute()
      }

      let successTasks = tasks.filter(v => v.c_set_subject_status_success === status.c_status_value)
      if (successTasks.length > 0) {
        c_tasks.updateMany({ _id: { $in: successTasks.map(t => t._id) } }, { $unset: { c_set_subject_status_success: 1 } })
          .execute()
      }

      let failTasks = tasks.filter(v => v.c_set_subject_status_failure === status.c_status_value)
      if (failTasks.length > 0) {
        c_tasks.updateMany({ _id: { $in: failTasks.map(t => t._id) } }, { $unset: { c_set_subject_status_failure: 1 } })
          .execute()
      }
    })

  }
}

if (_.contains(script.arguments.modified, 'c_televisit_enabled')) {
  if (!script.arguments.new.c_televisit_enabled) {
    org.objects.c_groups.updateMany({ c_study: script.context._id }, { $set: { c_televisit_enabled: false } })
      .limit(1000)
      .skipAcl()
      .grant(consts.accessLevels.update)
      .execute()
  }
}