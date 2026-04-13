/* eslint-disable camelcase */
/* eslint one-var: ["error", "consecutive"] */

import logger from 'logger'
import nucUtils from 'c_nucleus_utils'
import request from 'request'
import cache from 'cache'
import { TaskResponseDeactivation } from 'c_task_response_deactivation'

if (script.arguments.new.c_status && script.arguments.new.c_status === 'Inactive' && script.arguments.old.c_status !== 'Inactive') {

  let cacheKey = 'TRInactiveReason-' + script.context._id,
      auditMessage = cache.get(cacheKey)
  cache.clear(cacheKey)

  return TaskResponseDeactivation.deactivateTaskResponse(script.context._id, auditMessage)
}