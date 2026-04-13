import logger from 'logger'
import _ from 'underscore'

const taskResponseId = script.arguments.new._id

const { TaskResponse } = require('c_dmweb_lib')

if (TaskResponse.isPropPresent('c_clean_status')) {

  const cleanStatus = TaskResponse.calculateCurrentCleanStatus(taskResponseId)

  script.as('c_system_user', {}, () =>
    org.objects.c_task_response
      .updateOne({ _id: taskResponseId }, { $set: { c_clean_status: cleanStatus } })
      .execute()
  )
}