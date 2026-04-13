import nucUtils from 'c_nucleus_utils'
import { QueryType } from 'c_nucleus_query'
import logger from 'logger'
import nucPermissions from 'c_nucleus_permissions'

// Only manual queries request for task response status update
// System queries are handled separately for performance reasons
const { c_task_response, c_type } = script.arguments.new
if (c_task_response && c_type === QueryType.Manual) {
  nucUtils.updateTaskResponseStatus(c_task_response._id)
}

const { TaskResponse } = require('c_dmweb_lib')
if (TaskResponse.isPropPresent('c_clean_status')) {
  const taskResponseId = script.arguments.new.c_task_response._id
  const cleanStatus = TaskResponse.calculateCurrentCleanStatus(taskResponseId)

  script.as('c_system_user', {}, () =>
    org.objects.c_task_response
      .updateOne({ _id: taskResponseId }, { $set: { c_clean_status: cleanStatus } })
      .execute()
  )
}