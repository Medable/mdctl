import logger from 'logger'
const { Review } = require('c_dmweb_lib')

const taskResponseId = script.arguments.new.c_task_response._id

Review.invalidateReviewsByTaskResponse(taskResponseId)