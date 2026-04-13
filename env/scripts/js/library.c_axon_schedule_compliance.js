import moment from 'moment.timezone'
import config from 'config'
import { debug, error } from 'logger'

const { id: { getIdOrNull } } = require('util')
const { c_public_users } = org.objects

module.exports = function() {

  const previousTaskResponses = ({ c_group, c_task, c_public_user }, { limit, paths }) => {
    return org.objects.c_task_responses
      .find({ c_group, c_task, c_public_user })
      .paths(paths || '_id')
      .skipAcl()
      .grant(consts.accessLevels.read)
      .limit(limit || 1)
      .sort({ created: -1 })
      .toArray()
  }

  const checkIfBefore = (groupTask, taskResponse, range) => {

    const { c_group, c_task, c_public_user } = taskResponse

    const groupId = getIdOrNull(c_group, true)

    const taskId = getIdOrNull(c_task, true)

    const publicUserId = getIdOrNull(c_public_user, true)

    const filters = { c_group: groupId, c_task: taskId, c_public_user: publicUserId }

    const config = { limit: 1, paths: ['c_start', 'created'] }

    const [previousResponse] = previousTaskResponses(filters, config)

    if (!previousResponse) return false

    const publicUser = c_public_users.find({ _id: publicUserId })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .next()

    const { c_start, created } = previousResponse

    const { c_schedule_value } = groupTask

    const previousDateStr = c_start || created
    const previousDate = moment(previousDateStr)
      .tz(publicUser.c_tz || 'UTC')

    const nextTimeByRange = {
      hour: () => previousDate
        .add(c_schedule_value || 0, 'h'),
      day: () => previousDate
        .add(c_schedule_value || 0, 'd'),
      calendar_day: () => previousDate
        .startOf('day')
        .add(c_schedule_value || 0, 'd'),
      calendar_week: () => previousDate
        .startOf('week')
        .add(c_schedule_value || 0, 'w'),
      calendar_month: () => previousDate
        .startOf('month')
        .add(c_schedule_value || 0, 'M')
    }

    const next = nextTimeByRange[range]()

    const currentTime = moment(taskResponse.c_start)

    return currentTime.isBefore(next)
  }

  const always_available = () => false

  const one_time = (_groupTask, taskResponse) => {
    const { c_group, c_task, c_public_user } = taskResponse

    const groupId = getIdOrNull(c_group, true)

    const taskId = getIdOrNull(c_task, true)

    const publicUserId = getIdOrNull(c_public_user, true)

    const [dupeTaskResponse] = previousTaskResponses({ c_group: groupId, c_task: taskId, c_public_user: publicUserId }, { limit: 1 })

    return Boolean(dupeTaskResponse)
  }

  const hour = (groupTask, taskResponse) => checkIfBefore(groupTask, taskResponse, 'hour')

  const day = (groupTask, taskResponse) => checkIfBefore(groupTask, taskResponse, 'day')

  const calendar_day = (groupTask, taskResponse) => checkIfBefore(groupTask, taskResponse, 'calendar_day')

  const calendar_week = (groupTask, taskResponse) => checkIfBefore(groupTask, taskResponse, 'calendar_week')

  const calendar_month = (groupTask, taskResponse) => checkIfBefore(groupTask, taskResponse, 'calendar_month')

  // Function that checks if a Task Response is duplicated
  let isDuplicated = (taskResponse) => {

    const { c_group, c_task } = taskResponse

    const groupId = getIdOrNull(c_group, true)

    const taskId = getIdOrNull(c_task, true)

    if (!groupId || !taskId) return false

    const [groupTask] = org.objects.c_group_tasks
      .find({ c_assignment: taskId, c_group: groupId })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()

    if (!groupTask) return false

    const { c_schedule } = groupTask

    const scheduleMapping = {
      always_available,
      one_time,
      hour,
      day,
      calendar_day,
      calendar_week,
      calendar_month
    }

    const scheduleCheck = scheduleMapping[c_schedule]

    if (!scheduleCheck) return false

    return scheduleCheck(groupTask, taskResponse)
  }

  const isCustomConfigProvided = config.get('c_custom_schedule_compliance')

  if (isCustomConfigProvided) {

    const { c_compliance_function } = isCustomConfigProvided

    try {

      let customIsDuplicated = require(c_compliance_function)

      if (typeof customIsDuplicated === 'function') {

        isDuplicated = customIsDuplicated

      } else {
        error("Custom isDuplicated function: exported value is not a 'Function'")
      }

    } catch (err) {
      error(`Custom isDuplicated function: ${err}`)
    }
  }

  return {
    isDuplicated
  }

}