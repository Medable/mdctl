/***********************************************************

@script     Axon - Create Step Responses

@brief      Route for creating step responses in batch

@body
    stepResponses: array of step responses

@version    4.2.0

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import request from 'request'
import logger from 'logger'

let stepResponseData = request.body.stepResponses
const { c_task_responses, c_step_responses } = org.objects,
      taskResponseId = stepResponseData && stepResponseData.length > 0 && stepResponseData[0].c_task_response,
      taskRespCursor = c_task_responses.find({ _id: taskResponseId }).skipAcl().grant(consts.accessLevels.read),
      // get the task resposne
      taskResponse = taskRespCursor.hasNext() && taskRespCursor.next(),
      // get the existing step resposne
      stepResponses = taskResponse && c_step_responses.find({ c_task_response: taskResponse._id }).skipAcl().grant(consts.accessLevels.read).toArray(),
      study = taskResponse && taskResponse.c_study
      
if (taskResponse) {
    
  // check for duplicates in the submitted steps
  stepResponseData = stepResponseData.filter(v => {
    let stepResponse = stepResponses.find(sr => sr.c_step._id.equals(v.c_step))
    return !stepResponse
  })

  if(stepResponses.length > 0){
    logger.info('There would have been duplicates')
  }
  
  // now create the remaining steps
  stepResponseData.forEach(v => {
    const srData = Object.assign({c_study: study._id}, v),
          stepResponse = c_step_responses
            .insertOne(srData)
            .skipAcl()
            .grant(consts.accessLevels.update)
            .lean(false)
            .execute()
            
    stepResponses.push(stepResponse)
  })
}

let taskResponseUpdate = {},
    completionStep = stepResponses.find(v => v.type === 'c_completion' || v.type === 'c_consent_review')
    
taskResponseUpdate.c_success = !!(completionStep && completionStep.c_value)
taskResponseUpdate.c_completed = !stepResponses.find(v => v.c_file)

c_task_responses.updateOne({_id:taskResponseId}, {'$set': taskResponseUpdate }).skipAcl().grant(consts.accessLevels.update).execute()

return stepResponses