import request from 'request'
import _ from 'underscore'
import { SystemUser } from 'c_nucleus_utils'
import { genError } from 'c_axon_script_lib'

const { c_task_responses, c_step_responses } = org.objects,
      { c_task_response } = request.query,
      trCursor = c_task_responses.find({_id: c_task_response}).skipAcl().grant(consts.accessLevels.read),
      taskResponse = trCursor && trCursor.hasNext() && trCursor.next()
      
if(!taskResponse) {genError('You must provide a valid task resposen ID')}

let stepResposnes =  script.as(taskResponse.creator._id, {}, () => {return c_step_responses.find({c_task_response: taskResponse._id}).skipAcl().grant(consts.accessLevels.read).toArray()})
      
      
return {taskResponse, stepResposnes}