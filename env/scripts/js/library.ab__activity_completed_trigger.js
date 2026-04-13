import { trigger, log } from 'decorators'
import logger from 'logger'
import { Notification, getNotificationParams, activityNotificationData } from 'ab__notification'

class ActivityCompletedTrigger {

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
              $indexOfArray: ['$$SCRIPT.arguments.modified', 'c_completed']
            },
            0
          ]
        },
        {
          $eq: ['$$ROOT.c_success', true]
        },
        {
          $eq: ['$$ROOT.c_completed', true]
        }
      ]
    }
  })
  onActivityCompleted({ context, type, previous, current, modified }) {
    const activityNotifications = activityNotificationData()
    const activityCompletionNotifications = activityNotifications.activity_completion
    const publicUserID = previous.c_public_user._id
    const taskResponseId = previous._id
    const taskResponse = org.objects.c_task_response.find({ _id: taskResponseId })
      .expand('c_task', 'c_visit', 'c_group')
      .paths('c_task.c_key', 'c_task.c_name', 'c_task.c_visit_confirmation', 'c_visit', 'c_group')
      .locale('en_US')
      .toArray()[0]
    if (activityCompletionNotifications.length) {
      activityCompletionNotifications.forEach(notification => {
        let logContext = `${notification.name}:${notification.encounter}:${notification.activityName}`
        if (notification.scheduleType) {
          logContext = `${logContext}:${notification.scheduleType}`
        }
        logContext = `${logContext}:ActivityCompletedTrigger`
        if (this.matchCriteria(notification, taskResponse, logContext)) {
          this.performAction(notification, publicUserID, taskResponse, logContext)
        }
      })
    }
  }

  matchCriteria(notification, taskResponse, logContext) {
    if (!notification.activityName && !notification.activityKey) {
      logger.error(`[${logContext}] Neither activityName nor activityKey is present`)
      return false
    }

    if (
      (notification.activityKey && notification.activityKey !== taskResponse.c_task.c_key.toString()) ||
      (!notification.activityKey && notification.activityName !== taskResponse.c_task.c_name.toString())
    ) {
      return false
    }

    if (notification.encounter) {
      if (taskResponse.c_visit) {
        if (notification.encounter !== taskResponse.c_visit.c_name.toString()) return false
      } else if (taskResponse.c_group) {
        if (notification.encounter !== taskResponse.c_group.c_name.toString()) return false
      }
    }

    if (notification.stepNames) {
      if (!notification.comparisonValue) {
        logger.error(`[${logContext}] Comparison value not provided. Skipping scheduling notification`)
        return false
      }

      const allResponseValues = []
      try {
        notification.stepNames.split(',').forEach(stepName => {
          const stepResponseValues = this.getStepResponseValues(stepName, taskResponse._id, taskResponse.c_task._id, logContext)
          logger.info(`[${logContext}] Adding step response value for step: ${stepName} & value=${stepResponseValues}`)
          stepResponseValues.forEach(value => allResponseValues.push(value))
        })
        let stepResponsesAggregation = 0
        if (notification.stepResponsesAggregation === 'sum') {
          logger.info(`[${logContext}] Aggregating step response values ${allResponseValues} using sum`)
          allResponseValues.forEach(value => stepResponsesAggregation += (isNaN(parseInt(value)) ? value : parseInt(value)))
        }
        logger.info(`[${logContext}] stepResponseValues: ${allResponseValues} stepResponsesAggregation: ${stepResponsesAggregation} & comparisonValue: ${notification.comparisonValue}`)
        if (notification.comparisonOperator === '==') {
          if (stepResponsesAggregation.toString() !== notification.comparisonValue.toString()) return false
        } else if (notification.comparisonOperator === '>=') {
          if (stepResponsesAggregation < notification.comparisonValue) return false
        } else if (notification.comparisonOperator === '<=') {
          if (stepResponsesAggregation > notification.comparisonValue) return false
        } else if (notification.comparisonOperator === '>') {
          if (stepResponsesAggregation <= notification.comparisonValue) return false
        } else if (notification.comparisonOperator === '<') {
          if (stepResponsesAggregation >= notification.comparisonValue) return false
        } else if (notification.comparisonOperator === '!=') {
          if (stepResponsesAggregation === notification.comparisonValue) return false
        }
      } catch (e) {
        logger.error(`[${logContext}] Error while getting step response values: ${e.message}`)
        return false
      }
    }

    return true
  }

  performAction(notification, publicUserID, taskResponse, logContext) {
    const params = getNotificationParams(notification, publicUserID)
    params.taskResponseId = taskResponse._id
    new Notification(params).schedule(logContext)
    logger.info(`[${logContext}] Notification scheduled successfully`)
  }

  getStepResponseValues(stepName, taskResponseId, taskId, logContext) {
    const stepResponseValues = []
    const step = org.objects.c_step.find({ c_name: stepName, c_task: taskId }).toArray()[0]
    if (!step) {
      throw new Error(`[${logContext}] Step not found: ${stepName}`)
    }
    const stepResponse = org.objects.c_step_response
      .find({ c_step: step._id, c_task_response: taskResponseId })
      .paths('c_value', 'type')
      .toArray()[0]
    if (stepResponse) {
      if (stepResponse.type === 'c_text_choice') {
        stepResponse.c_value.forEach(value => stepResponseValues.push(value))
      } else {
        stepResponseValues.push(stepResponse.c_value)
      }
    }
    return stepResponseValues
  }
}