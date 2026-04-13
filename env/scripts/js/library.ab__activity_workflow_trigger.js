import { trigger, log } from 'decorators'
import config from 'config'
import logger from 'logger'
import { activityWorkflowData, setDynamicVRSPatientFlag, unsetDynamicVRSPatientFlag } from 'ab__workflow_utils'

const ACTIVITY_DEPENDENCY = 'activity_dependency'
const DATE_SCREEN_RESPONSE = 'date_screen_response'
const SCREEN_RESPONSE = 'screen_response'
const SCHEDULE_TIMELINE_CONDITION = 'schedule_timeline_condition'
const PARTICIPANT_STATUS_CONDITION = 'participant_status_condition'
const PAUSE_DYNAMIC_VRS_CONDITION = 'pause_dynamic_vrs_condition'
const UNPAUSE_DYNAMIC_VRS_CONDITION = 'unpause_dynamic_vrs_condition'

class ActivityWorkflowCompletedTrigger {

  @log({  traceError: true })
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

    const activityWorkflowDependencies = activityWorkflowData()
    const publicUserID = previous.c_public_user._id
    const taskResponseId = previous._id
    const taskResponse = org.objects.c_task_response.find({ _id: taskResponseId })
      .expand('c_task', 'c_visit', 'c_group')
      .paths('c_task.c_key', 'c_task.c_name', 'c_task.c_visit_confirmation', 'c_visit', 'c_group')
      .toArray()[0]
    if (activityWorkflowDependencies[taskResponse.c_task.c_key]) {
      const activityDependencies = activityWorkflowDependencies[taskResponse.c_task.c_key].activity_dependencies || []
      const scheduleTimelineConditions = activityWorkflowDependencies[taskResponse.c_task.c_key].schedule_timeline_conditions || []
      const participantStatusConditions = activityWorkflowDependencies[taskResponse.c_task.c_key].participant_status_conditions || []
      const pauseDynamicVRSConditions = activityWorkflowDependencies[taskResponse.c_task.c_key].pause_dynamic_vrs_conditions || []
      const unpauseDynamicVRSConditions = activityWorkflowDependencies[taskResponse.c_task.c_key].unpause_dynamic_vrs_conditions || []
      if (activityDependencies.length || scheduleTimelineConditions.length || participantStatusConditions.length || pauseDynamicVRSConditions.length || unpauseDynamicVRSConditions.length) {
        const stepResponses = org.objects.c_step_response.find({ c_task_response: taskResponseId })
          .expand('c_step')
          .paths('c_step.c_name', 'c_step.c_key', 'type', 'c_value', 'c_start_date')
          .toArray()
        activityDependencies.forEach(activityDependency => {
          if (this.matchCriteria(activityDependency.workflow_type, activityDependency, taskResponse, stepResponses)) {
            this.performAction(activityDependency.workflow_type, activityDependency, publicUserID, stepResponses)
          }
        })
        scheduleTimelineConditions.forEach(scheduleTimelineCondition => {
          if (this.matchCriteria(scheduleTimelineCondition.workflow_type, scheduleTimelineCondition, taskResponse, stepResponses)) {
            this.performAction(scheduleTimelineCondition.workflow_type, scheduleTimelineCondition, publicUserID, stepResponses)
          }
        })
        participantStatusConditions.forEach(participantStatusCondition => {
          if (this.matchCriteria(participantStatusCondition.workflow_type, participantStatusCondition, taskResponse, stepResponses)) {
            this.performAction(participantStatusCondition.workflow_type, participantStatusCondition, publicUserID, stepResponses)
          }
        })
        pauseDynamicVRSConditions.forEach(pauseDynamicVRSCondition => {
          if (this.matchCriteria(pauseDynamicVRSCondition.workflow_type, pauseDynamicVRSCondition, taskResponse, stepResponses)) {
            this.performAction(pauseDynamicVRSCondition.workflow_type, pauseDynamicVRSCondition, publicUserID, stepResponses)
          }
        })
        unpauseDynamicVRSConditions.forEach(unpauseDynamicVRSCondition => {
          if (this.matchCriteria(unpauseDynamicVRSCondition.workflow_type, unpauseDynamicVRSCondition, taskResponse, stepResponses)) {
            this.performAction(unpauseDynamicVRSCondition.workflow_type, unpauseDynamicVRSCondition, publicUserID, stepResponses)
          }
        })
      }
    }

    this.unsetUnscheduledPatientFlags(taskResponse, publicUserID)
  }

  matchCriteria(workflowType, payload, taskResponse, stepResponses) {
    const triggerType = payload.trigger_type
    const activityKey = payload.activity_key
    const activityName = payload.activity_name
    const screenKey = payload.screen_key
    const screenName = payload.screen_name
    if (workflowType === ACTIVITY_DEPENDENCY && triggerType === DATE_SCREEN_RESPONSE) {
      const stepResponseValue = this.getStepResponseValues(screenKey, screenName, stepResponses)[0]
      if (!stepResponseValue || isNaN(Date.parse(stepResponseValue))) {
        logger.error('Step response value not a date value')
        return false
      }

      return true
    } else if (
        [SCHEDULE_TIMELINE_CONDITION, PARTICIPANT_STATUS_CONDITION].includes(workflowType) || 
        (workflowType === ACTIVITY_DEPENDENCY && triggerType === SCREEN_RESPONSE)
      ) {
      const visitKey = payload.visit_key
      const visitName = payload.visit_name
      const comparisonOperator = payload.comparison_operator
      const comparisonValue = payload.comparison_value
      if (!activityKey && !activityName) {
        logger.error('Neither activityKey nor activityName is present')
        return false
      }
      if (
        (activityKey && activityKey !== taskResponse.c_task.c_key.toString()) ||
        (!activityKey && activityName !== taskResponse.c_task.c_name.toString())
      ) {
        return false
      }

      if (visitName) {
        if (taskResponse.c_visit) {
          if (visitKey !== taskResponse.c_visit.c_key.toString()) return false
        } else if (taskResponse.c_group) {
          if (visitName !== taskResponse.c_group.c_name.toString()) return false
        }
      }

      if (screenKey || screenName) {
        if (!this.isValuePresent(comparisonValue)) {
          logger.error('Comparison value not provided.')
          return false
        }
        const stepResponseValue = this.getStepResponseValues(screenKey, screenName, stepResponses)
        if (comparisonOperator === '==') {
          if (stepResponseValue != comparisonValue) return false
        } else if (comparisonOperator === '>=') {
          if (stepResponseValue < comparisonValue) return false
        } else if (comparisonOperator === '<=') {
          if (stepResponseValue > comparisonValue) return false
        } else if (comparisonOperator === '>') {
          if (stepResponseValue <= comparisonValue) return false
        } else if (comparisonOperator === '<') {
          if (stepResponseValue >= comparisonValue) return false
        } else if (comparisonOperator === '!=') {
          if (stepResponseValue == comparisonValue) return false
        }
      }

      return true
    } else if (workflowType === PAUSE_DYNAMIC_VRS_CONDITION) {
      return true
    } else if (workflowType === UNPAUSE_DYNAMIC_VRS_CONDITION) {
      return true
    }

    return false
  }

  performAction(workflowType, payload, publicUserID, stepResponses) {
    const triggerType = payload.trigger_type
    if (workflowType === ACTIVITY_DEPENDENCY) {
      const activityName = payload.activity_name
      const screenKey = payload.screen_key
      const screenName = payload.screen_name
      if (triggerType === DATE_SCREEN_RESPONSE) {
        const anchorDateIdentifier = `${activityName} - ${screenName}`
        const anchorDate = org.objects.c_anchor_date_template.find({ c_identifier: anchorDateIdentifier })
          .locale('en_US')
          .paths('_id')
          .toArray()[0]
        if (!anchorDate) {
          logger.error(`Anchor Date not found: ${anchorDateIdentifier}`)
        }
        const anchorDateId = anchorDate._id
        const existingAnchorDate = org.objects.c_public_users.find({ _id: publicUserID })
          .paths('c_set_dates')
          .toArray()[0]
          .c_set_dates
          .find(csd => csd.c_template._id.toString() === anchorDateId)
    
        if (!existingAnchorDate) {
          const anchorDateValue = this.getStepResponseValues(screenKey, screenName, stepResponses)[0]
          script.fire('c_anchor_dates_did_change', publicUserID, [anchorDateId])
          org.objects.c_public_user.updateOne(
            { _id: publicUserID },
            {
              $push: {
                c_set_dates: [
                  {
                    c_template: anchorDateId,
                    c_date: anchorDateValue
                  }
                ]
              },
              $set: {
                c_events_generating: true
              }
            }
          )
            .skipAcl()
            .grant(consts.accessLevels.update)
            .execute()
        }
      } else if (triggerType === SCREEN_RESPONSE) {
        const comparisonOperator = payload.comparison_operator
        const comparisonValue = payload.comparison_value
        const isUnscheduledVisitDependency = payload.is_unscheduled_visit_dependency
        const patientFlagIdentifier = isUnscheduledVisitDependency
          ? `${activityName} Unscheduled - ${screenName} ${comparisonOperator} ${comparisonValue}`
          : `${activityName} - ${screenName} ${comparisonOperator} ${comparisonValue}`
        const anchorDateIdentifier = patientFlagIdentifier
        const patientFlag = org.objects.c_patient_flag.find({ c_identifier: patientFlagIdentifier }).paths('_id').toArray()[0]
        const anchorDate = org.objects.c_anchor_date_template.find({ c_identifier: anchorDateIdentifier })
          .locale('en_US')
          .paths('_id')
          .toArray()[0]
        if (!patientFlag && !anchorDate) {
          logger.error(`Patient flag and anchor date not found for identifier: ${patientFlagIdentifier}`)
        } else if (!patientFlag) {
          logger.warn(`Patient flag not found: ${patientFlagIdentifier}`)
        } else if (!anchorDateIdentifier) {
          logger.warn(`Anchor date identifier not found: ${anchorDateIdentifier}`)
        }
        if (patientFlag) {
          const patientFlagId = patientFlag._id
          const setPatientFlags = org.objects.c_public_user.find({ _id: publicUserID}).paths('c_set_patient_flags')
            .skipAcl()
            .grant(consts.accessLevels.read)
            .toArray()[0].c_set_patient_flags
          const patientFlagAssignment = setPatientFlags.find(pf => pf.c_identifier === patientFlagIdentifier)
          script.fire('c_flags_did_change', publicUserID, [patientFlagId])
          if (patientFlagAssignment) {
            org.objects.c_public_user.updateOne({ _id: publicUserID }, {
              $set: {
                c_set_patient_flags: [
                  {
                    _id: patientFlagAssignment._id,
                    c_enabled: true
                  }
                ],
                c_events_generating: true
              }
            })
              .skipAcl()
              .grant(consts.accessLevels.update)
              .execute()
          } else {
            org.objects.c_public_user.updateOne(
              { _id: publicUserID },
              {
                $push: {
                  c_set_patient_flags: [
                    {
                      c_enabled: true,
                      c_flag: patientFlagId,
                      c_identifier: patientFlagIdentifier
                    }
                  ]
                },
                $set: {
                  c_events_generating: true
                }
              }
            )
              .skipAcl()
              .grant(consts.accessLevels.update)
              .execute()
          }
        }
        if (anchorDate) {
          const anchorDateId = anchorDate._id
          const existingAnchorDate = org.objects.c_public_users.find({ _id: publicUserID })
            .paths('c_set_dates')
            .toArray()[0]
            .c_set_dates
            .find(csd => csd.c_template._id.toString() === anchorDateId)
    
          if (!existingAnchorDate) {
            const stepResponse = stepResponses.find(stepResponse => stepResponse.c_step.c_key === screenKey || stepResponse.c_step.c_name === screenName)
            let anchorDateValue = stepResponse.c_start_date
            if (!anchorDateValue) {
              logger.error(`Step response start date not found for stepResponseId: ${stepResponse._id}`)
            }
            const publicUser = org.objects.c_public_user
              .find({ _id: publicUserID })
              .paths('c_tz')
              .skipAcl()
              .grant(consts.accessLevels.read)
              .next()
            const tz = publicUser.c_tz
            if (tz) {
              const moment = require('moment.timezone')
              anchorDateValue = moment(anchorDateValue)
                .tz(tz)
                .format('YYYY-MM-DD')
            }
            script.fire('c_anchor_dates_did_change', publicUserID, [anchorDateId])
            org.objects.c_public_user.updateOne(
              { _id: publicUserID },
              {
                $push: {
                  c_set_dates: [
                    {
                      c_template: anchorDateId,
                      c_date: anchorDateValue
                    }
                  ]
                },
                $set: {
                  c_events_generating: true
                }
              }
            )
              .skipAcl()
              .grant(consts.accessLevels.update)
              .execute()
          }
        }
      }
    } else if (workflowType === SCHEDULE_TIMELINE_CONDITION) {
      const visitScheduleKey = payload.visit_schedule_key
      const visitScheduleName = payload.visit_schedule_name
      const visitScheduleId = org.objects.c_visit_schedule.find({c_key: visitScheduleKey})
        .toArray()[0]
        ._id
      this.updateScheduleSwitchPatientFlags(publicUserID, visitScheduleName)

      return org.objects.c_public_user.updateOne(
        { _id: publicUserID },
        { $set: { c_visit_schedule: visitScheduleId } }
      )
        .skipAcl()
        .grant(consts.accessLevels.update)
        .execute()
    } else if (workflowType === PARTICIPANT_STATUS_CONDITION) {
      const participantStatus = payload.participant_status
      return org.objects.c_public_user.updateOne(
        { _id: publicUserID },
        { $set: { c_status: participantStatus } }
      )
        .skipAcl()
        .grant(consts.accessLevels.update)
        .execute()
    } else if (workflowType === PAUSE_DYNAMIC_VRS_CONDITION) {
      setDynamicVRSPatientFlag(publicUserID, payload.dynamic_vrs_activity_key, payload.dynamic_vrs_activity_name)
    } else if (workflowType === UNPAUSE_DYNAMIC_VRS_CONDITION) {
      unsetDynamicVRSPatientFlag(publicUserID, payload.dynamic_vrs_activity_name)
    }
  }

  getStepResponseValues(stepKey, stepName, stepResponses) {
    const stepResponseValues = []
    const stepResponse = stepResponses.find(stepResponse => stepResponse.c_step.c_key === stepKey || stepResponse.c_step.c_name === stepName)
    if (!stepResponse) {
      logger.error(`StepResponse not found for step name: ${stepName}, step key: ${stepKey}`)
    }
    if (stepResponse.type === 'c_text_choice') {
      stepResponse.c_value.forEach(value => stepResponseValues.push(value))
    } else {
      stepResponseValues.push(stepResponse.c_value)
    }

    return stepResponseValues
  }

  isValuePresent(value) {
    return value !== '' && value !== undefined && value !== null
  }

  updateScheduleSwitchPatientFlags(publicUserID, currentVisitScheduleName) {
    const visitSchedules = org.objects.c_visit_schedule.find().paths('_id', 'c_name').toArray()
    const setPatientFlags = org.objects.c_public_user.find({ _id: publicUserID}).paths('c_set_patient_flags')
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()[0].c_set_patient_flags
    if (visitSchedules.length <= 1) {
      return
    }

    visitSchedules.forEach(visitSchedule => {
      const patientFlagIdentifier = `${visitSchedule.c_name} Visit Schedule Enabled`
      const patientFlagAssignment = setPatientFlags.find(pf => pf.c_identifier === patientFlagIdentifier)
      if (patientFlagAssignment) {
        script.fire('c_flags_did_change', publicUserID, [patientFlagAssignment.c_flag._id])
        return org.objects.c_public_user.updateOne({ _id: publicUserID }, {
          $set: {
            c_set_patient_flags: [
              {
                _id: patientFlagAssignment._id,
                c_enabled: visitSchedule.c_name === currentVisitScheduleName
              }
            ],
            c_events_generating: true
          }
        })
          .skipAcl()
          .grant(consts.accessLevels.update)
          .execute()
      } else {
        const patientFlag = org.objects.c_patient_flag.find({ c_identifier: patientFlagIdentifier }).paths('_id').toArray()[0]
        script.fire('c_flags_did_change', publicUserID, [patientFlag._id])
        return org.objects.c_public_user.updateOne({ _id: publicUserID }, {
          $push: {
            c_set_patient_flags: {
              c_identifier: patientFlagIdentifier,
              c_enabled: visitSchedule.c_name === currentVisitScheduleName,
              c_flag: patientFlag._id
            }
          },
          $set: {
            c_events_generating: true
          }
        })
          .skipAcl()
          .grant(consts.accessLevels.update)
          .execute()
      }
    })
  }  

  unsetUnscheduledPatientFlags(taskResponse, publicUserID) {
    try {
      const visit = taskResponse.c_visit
      if (taskResponse.c_task.c_visit_confirmation && visit && ['supplemental', 'unscheduled'].includes(visit.c_type)) {
        const unscheduledPatientFlags = config.get('ab__unscheduled_patient_flags')
        const setPatientFlags = org.objects.c_public_user.find({ _id: publicUserID}).paths('c_set_patient_flags')
          .skipAcl()
          .grant(consts.accessLevels.read)
          .toArray()[0].c_set_patient_flags
        unscheduledPatientFlags.forEach(patientFlagIdentifier => {
          const patientFlagAssignment = setPatientFlags.find(pf => pf.c_identifier === patientFlagIdentifier)
          if (patientFlagAssignment) {
            script.fire('c_flags_did_change', publicUserID, [patientFlagAssignment.c_flag._id])
            return org.objects.c_public_user.updateOne({ _id: publicUserID }, {
              $set: {
                c_set_patient_flags: [
                  {
                    _id: patientFlagAssignment._id,
                    c_enabled: false
                  }
                ],
                c_events_generating: true
              }
            })
              .skipAcl()
              .grant(consts.accessLevels.update)
              .execute()
          }
        })
      }
    } catch (e) {
      logger.error('Error while unsetting unscheduled patient flag', e)
    }
  }
}