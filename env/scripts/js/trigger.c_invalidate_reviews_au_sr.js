import logger from 'logger'
const { Review } = require('c_dmweb_lib')

const isValueModified = script.arguments.modified.indexOf('c_value') >= 0
const taskResponseId = script.arguments.old.c_task_response._id

return isValueModified && Review.invalidateReviewsByTaskResponse(taskResponseId)