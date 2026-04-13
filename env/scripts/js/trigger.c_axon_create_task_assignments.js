/***********************************************************

 @script     Axon - Task Assignment

 @brief      An on create before trigger to check validation of a task assignment

 @author     Ashwini Namdev

 (c)2022 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import { genError } from 'c_axon_script_lib'
import _ from 'lodash'
const { type, c_schedule_rules, c_time_window } = script.arguments.new
if (!c_time_window) {
  return
}
if (type === 'c_scheduled_assignment' && _.get(c_schedule_rules, '0.c_schedule_type') === 'rrule') {
  const scheduleStr = _.get(c_schedule_rules, '0.c_schedule_value')
  const duration = c_time_window.c_duration
  let getDaysInMin
  let checkIfdailyScheduled = false
  const splitStr = (scheduleValuesStr) => {
    const valuesArr = scheduleValuesStr.split('=')
    if (valuesArr[1].trim() === 'DAILY') {
      checkIfdailyScheduled = true
    }
    if (checkIfdailyScheduled && valuesArr[0].trim() === 'INTERVAL') {
      getDaysInMin = parseInt(valuesArr[1].trim()) * 1440
      if (getDaysInMin < duration) {
        return genError('The duration of each event can\'t be greater than the frequency.')
      }
    }
  }
  scheduleStr.split(';')
    .map(splitStr)
}