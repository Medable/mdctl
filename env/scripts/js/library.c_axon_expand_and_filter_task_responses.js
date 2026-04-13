/***********************************************************

@script     Axon - Expand and Filter Task Responses

@brief      Defines a transform which expands task response properties (some
            of which don't have a direct linkage) and filters out task
            responses based on criteria in PATAND-32, PATIOS-50, PAWEB-448

@author     Pete Richards

@transform  c_axon_expand_task_response_fields

@version    4.12.0

(c)2020 Medable, Inc.  All Rights Reserved.

***********************************************************/

import moment from 'moment.timezone'
import { transform } from 'decorators'

// Helper, calculate start dates based on a timezone.
function getStartDates(timezone) {
  const now = moment()
    .tz(timezone)
  const startOfDay = moment(now)
    .startOf('day')
    .utc()
  const startOfWeek = moment(now)
    .startOf('week')
    .utc()
  const startOfMonth = moment(now)
    .startOf('month')
    .utc()
  return { startOfDay, startOfWeek, startOfMonth }
}

// For each schedule type that should be filtered, returns the date that
// responses must occur after or else they will be filtered out.
function makeScheduleFilterDates({ startOfDay, startOfWeek, startOfMonth }) {
  return {
    always_available: startOfDay,
    one_time: startOfDay,
    hour: startOfDay,
    day: startOfDay,
    calendar_day: startOfDay,
    calendar_week: startOfWeek,
    calendar_month: startOfMonth
  }
}

// converts filter dates from moments to strings.
function serializeFilterDates(filterDates) {
  return Object.keys(filterDates)
    .reduce((memo, key) => {
      memo[key] = filterDates[key].format()
      return memo
    }, {})
}

// Converts filter dates from strings to moments.
function deserializeFilterDates(filterDates) {
  return Object.keys(filterDates)
    .reduce((memo, key) => {
      memo[key] = moment(filterDates[key])
      return memo
    }, {})
}

@transform('c_axon_expand_task_response_fields')
class ExpandTaskResponseFields {

  beforeAll(memo) {
    const startDates = getStartDates(memo.tz),
          filterDates = makeScheduleFilterDates(startDates)

    memo.filterDates = serializeFilterDates(filterDates)
  }

  before(memo) {
    this.filterDates = deserializeFilterDates(memo.filterDates)
  }

  shouldExcludeResponse(taskResponse) {
    if (!taskResponse.c_group_task) {
      return false
    }
    const compareDate = taskResponse.c_start
            ? taskResponse.c_start
            : taskResponse.created,
          filterDate = this.filterDates[taskResponse.c_group_task.c_schedule]
    if (!filterDate) {
      return false
    }
    return filterDate.isAfter(compareDate)
  }

  expandTask(taskResponse) {
    const task = org.objects.c_task
      .readOne({ _id: taskResponse.c_task._id })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .throwNotFound(false)
      .execute()

    if (task) {
      taskResponse.c_task = task
    }
  }

  expandAssignment(taskResponse) {
    const assignment = org.objects.c_group_tasks
      .readOne({
        c_group: taskResponse.c_group._id,
        c_assignment: taskResponse.c_task._id
      })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .throwNotFound(false)
      .execute()

    if (assignment) {
      taskResponse.c_group_task = assignment
    }
  }

  each(taskResponse) {
    this.expandAssignment(taskResponse)
    if (this.shouldExcludeResponse(taskResponse)) {
      return
    }
    this.expandTask(taskResponse)
    return taskResponse
  }

}

module.exports = ExpandTaskResponseFields