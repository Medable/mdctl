import logger from 'logger'
import _ from 'underscore'
import nucUtils from 'c_nucleus_utils'

if(!script.arguments.new.c_completed) return
if(!script.arguments.new.hasOwnProperty('c_success') && !script.arguments.old.hasOwnProperty('c_success')) return

let taskResponseId = script.arguments.new._id,
    success = script.arguments.new.c_success || script.arguments.old.c_success,
    publicUserID = script.arguments.old.c_public_user && script.arguments.old.c_public_user._id

if(publicUserID) {
    nucUtils.setPublicUserStatusFromTaskResponse(taskResponseId, success, publicUserID)
}