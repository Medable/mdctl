import logger from 'logger'
import _ from 'underscore'
import nucUtils from 'c_nucleus_utils'

if (!script.arguments.new.c_completed) return

let taskResponseId = script.arguments.new._id,
    success = script.arguments.new.c_success,
    publicUserID = script.arguments.new.c_public_user && script.arguments.new.c_public_user._id

if (publicUserID) {
  nucUtils.setPublicUserStatusFromTaskResponse(taskResponseId, success, publicUserID)
}