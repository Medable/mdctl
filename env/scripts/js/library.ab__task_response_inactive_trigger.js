import { trigger, log } from 'decorators'
import logger from 'logger'
import { activityWorkflowData, setDynamicVRSPatientFlag, unsetDynamicVRSPatientFlag } from 'ab__workflow_utils'

const PAUSE_DYNAMIC_VRS_CONDITION = 'pause_dynamic_vrs_condition'
const UNPAUSE_DYNAMIC_VRS_CONDITION = 'unpause_dynamic_vrs_condition'

class TaskResponseInactiveTrigger {

  @log({ traceError: true })
  @trigger('update.after', {
    object: 'c_task_response',
    weight: 1,
    principal: 'c_system_user',
    if: {
      $and: [
        {
          $gte: [
            {
              $indexOfArray: ['$$SCRIPT.arguments.modified', 'c_status']
            },
            0
          ]
        },
        {
          $eq: ['$$ROOT.c_status', 'Inactive']
        }
      ]
    }
  })
  onTaskResponseInactive({ context, type, previous, current, modified }) {
    const activityWorkflowDependencies = activityWorkflowData()
    const publicUserID = previous.c_public_user._id
    const taskResponseId = previous._id
    const taskResponse = org.objects.c_task_response.find({ _id: taskResponseId })
      .expand('c_task')
      .paths('c_task.c_key', 'c_task.c_name', 'c_task.c_visit_confirmation')
      .toArray()[0]
    if (activityWorkflowDependencies[taskResponse.c_task.c_key]) {
      const pauseDynamicVRSConditions = activityWorkflowDependencies[taskResponse.c_task.c_key].pause_dynamic_vrs_conditions || []
      const unpauseDynamicVRSConditions = activityWorkflowDependencies[taskResponse.c_task.c_key].unpause_dynamic_vrs_conditions || []
      if (pauseDynamicVRSConditions.length || unpauseDynamicVRSConditions.length) {
        pauseDynamicVRSConditions.forEach(pauseDynamicVRSCondition => {
          if (this.matchCriteria(pauseDynamicVRSCondition.workflow_type)) {
            this.performAction(pauseDynamicVRSCondition.workflow_type, pauseDynamicVRSCondition, publicUserID)
          }
        })
      }
      unpauseDynamicVRSConditions.forEach(unpauseDynamicVRSCondition => {
        if (this.matchCriteria(unpauseDynamicVRSCondition.workflow_type)) {
          this.performAction(unpauseDynamicVRSCondition.workflow_type, unpauseDynamicVRSCondition, publicUserID)
        }
      })
    }
  }

  matchCriteria(workflowType) {
    return workflowType === PAUSE_DYNAMIC_VRS_CONDITION || workflowType === UNPAUSE_DYNAMIC_VRS_CONDITION
  }

  performAction(workflowType, payload, publicUserID) {
    if (workflowType === PAUSE_DYNAMIC_VRS_CONDITION) {
      unsetDynamicVRSPatientFlag(publicUserID, payload.dynamic_vrs_activity_name)
    } else if (workflowType === UNPAUSE_DYNAMIC_VRS_CONDITION) {
      setDynamicVRSPatientFlag(publicUserID, payload.dynamic_vrs_activity_key, payload.dynamic_vrs_activity_name)
    }
  }
}