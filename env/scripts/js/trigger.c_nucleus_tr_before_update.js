/***********************************************************

@script     Nucleus - Public User Before Update (Permission Management)

@brief      Permission management of the status properties

@author     Fiachra Matthews

@version    1.0.0

(c)2018-2014 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

/* eslint-disable camelcase */
import faults from 'c_fault_lib'

import logger from 'logger'
import nucUtils from 'c_nucleus_utils'
import request from 'request'
import cache from 'cache'
let _ = require('underscore')

if (nucUtils.AclManagment.canEditTaskResponse()) {

  if (script.arguments.new.c_status && script.arguments.new.c_status !== script.arguments.old.c_status) { // are we updatding the status
    if (nucUtils.AclManagment.canSetTaskResponseStatus()) { // does the user have permission to set this status

      if (script.arguments.new.c_status === 'Inactive') {
        let c_task_response = org.objects.c_task_responses.find({ _id: script.context._id })
          .skipAcl()
          .grant(consts.accessLevels.read)
          .paths('c_account', 'creator')
          .passive()
          .next()

        if (!c_task_response.creator || nucUtils.isSystemUserID(c_task_response.creator._id) || (c_task_response.c_account && c_task_response.c_account._id.equals(c_task_response.creator._id))) {
          faults.throw('axon.accessDenied.noEditPatientTasks')
        }

        // it's important that we don't start chagning step resposnes and queries till the after trigger,
        // so we're caching the reason for change to apply it to those operations then
        let cacheKey = 'TRInactiveReason-' + script.arguments.new._id

        const cachedAuditMessage = cache.get(cacheKey)

        const auditMessage = (request.body.audit && request.body.audit.message) || cachedAuditMessage

        if (auditMessage) {

          cache.set(cacheKey, auditMessage, 300)

        } else {

          faults.throw('axon.invalidArgument.reasonForChangeRequired')

        }
      }
    }
  }
}