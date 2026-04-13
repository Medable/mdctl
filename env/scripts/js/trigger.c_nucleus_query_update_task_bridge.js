import { QueryStatus } from 'c_nucleus_query'
import nucUtils from 'c_nucleus_utils'
// singleing out for manual queries
if (!script.arguments.old.c_task_response) return

const {
  old: {
    c_status: oldStatus,
    c_task_response: { _id: trId }
  },
  new: {
    c_status: newStatus
  }
} = script.arguments

if (newStatus && newStatus !== oldStatus) {
  nucUtils.updateTaskResponseStatus(trId)
}

const { TaskResponse } = require('c_dmweb_lib')
if (TaskResponse.isPropPresent('c_clean_status')) {
  const queryId = script.arguments.new._id

  const query = org.objects.c_queries.find({ _id: queryId })
    .skipAcl()
    .grant(consts.accessLevels.read)
    .next()

  const taskResponseId = query.c_task_response._id

  const cleanStatus = TaskResponse.calculateCurrentCleanStatus(taskResponseId)

  script.as('c_system_user', {}, () =>
    org.objects.c_task_response
      .updateOne({ _id: taskResponseId }, { $set: { c_clean_status: cleanStatus } })
      .execute()
  )
}