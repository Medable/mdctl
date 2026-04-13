import logger from 'logger'

const { TaskResponse } = require('c_dmweb_lib')
if (TaskResponse.isPropPresent('c_clean_status')) {
  const reviewId = script.arguments.new._id

  const review = org.objects.c_reviews.find({ _id: reviewId })
    .skipAcl()
    .grant(consts.accessLevels.read)
    .next()

  const taskResponseId = review.c_task_response._id

  const cleanStatus = TaskResponse.calculateCurrentCleanStatus(taskResponseId)

  script.as('c_system_user', {}, () =>
    org.objects.c_task_response
      .updateOne({ _id: taskResponseId }, { $set: { c_clean_status: cleanStatus } })
      .execute()
  )

}