/***********************************************************

 @script     Axon - Time windows & Missed Tasks Library

 @brief      Manages functions and triggers for missed tasks

 @author     Fiachra Matthews

 (c)2020 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import { trigger, log, job, transform, as, on } from 'decorators'
import faults from 'c_fault_lib'
import moment from 'moment.timezone'
import { debug } from 'logger'
const { paths: { to: pathsTo } } = require('util')

const { c_missed_tasks, c_group_tasks, c_public_users, c_task_responses } = org.objects
const asOptions = { principal: { skipAcl: true, grant: consts.accessLevels.script, bypassCreateAcl: true }, modules: { safe: false }, acl: { safe: false } }

function isTodayAvailable(subject, assignment, todayForSubject, logInformation) {

  const subjectTz = subject.c_tz || 'UTC'

  let isTodayAvailable = true

  const { c_schedule_value, c_group, c_assignment } = assignment

  if (c_schedule_value > 1) {

    const trCursor = c_task_responses.find({ c_group: c_group._id, c_task: c_assignment._id, c_public_user: subject._id })
      .sort({ created: -1 })
      .paths('created', 'c_start', 'c_step_responses.c_start_date')
      .passive()
      .limit(1)

    if (trCursor.hasNext()) {
      const tr = trCursor.next()
      let trDay

      if (tr.c_start) {
        trDay = moment(tr.c_start)
          .tz(subjectTz)
          .startOf('day')
      } else {
        trDay = moment(tr.c_step_responses[0].c_start_date)
          .tz(subjectTz)
          .startOf('day')
      }

      const nextAvailableDay = trDay.add(c_schedule_value, 'days')

      if (nextAvailableDay.isAfter(todayForSubject)) {
        // we don't need to create a missed task object fo this today
        isTodayAvailable = false
      }

    }

  }

  // for debugging purposes
  const index = logInformation.resultPerAssignment.findIndex(({ _id }) => _id.toString() === assignment._id.toString())
  if (index >= 0) {
    logInformation.resultPerAssignment[index] = {
      ...logInformation.resultPerAssignment[index],
      assignment,
      isTodayAvailable
    }
  }

  return isTodayAvailable
}

// check was a task response done in the task window we have defined
function wasTaskResponseCompleted(subject, assignment, taskStart, taskEnd) {

  let wasCompleted = false

  const { c_group, c_assignment } = assignment

  const trCursor = c_task_responses.find({ c_group: c_group._id, c_task: c_assignment._id, c_public_user: subject._id })
    .sort({ created: -1 })
    .paths('created', 'c_start', 'c_step_responses.c_start_date')
    .passive()
    .limit(1)

  if (trCursor.hasNext()) {

    const taskResponse = trCursor.next()

    const { c_start, c_step_responses: { data: [{ c_start_date }] } } = taskResponse

    const completionDate = c_start || c_start_date || taskResponse.created

    wasCompleted = moment(completionDate)
      .isAfter(taskStart) && moment(completionDate)
      .isBefore(taskEnd)
  }

  return wasCompleted
}

// checks if the subject is completing a task in between the date range, date range is only valid if both
// start date and end date have a value AND if they are in between assignment's date range
function isInDateRange(subject, assignment, today, logInformation) {

  const todayOnlyDate = moment(today)
    .format('YYYY-MM-DD')

  let isStartDateInRange = false

  let isEndDateInRange = false

  const startDate = calculateStartDate(subject, assignment)

  const endDate = calculateEndDate(subject, assignment)

  if (startDate) {

    const isBeforeStartDate = moment(todayOnlyDate)
      .isBefore(startDate)

    if (!isBeforeStartDate) {
      isStartDateInRange = true
    }

  }

  if (endDate) {

    const isAfterEndDate = moment(todayOnlyDate)
      .isAfter(endDate)

    if (!isAfterEndDate) {
      isEndDateInRange = true
    }

  }

  const index = logInformation.resultPerAssignment.findIndex(({ _id }) => _id.toString() === assignment._id.toString())
  if (index >= 0) {
    logInformation.resultPerAssignment[index] = {
      ...logInformation.resultPerAssignment[index],
      startDate,
      endDate,
      isStartDateInRange,
      isEndDateInRange,
      currentDate: todayOnlyDate,
      isInRange: isStartDateInRange && isEndDateInRange
    }
  }

  return isStartDateInRange && isEndDateInRange && moment(startDate)
    .isSameOrBefore(moment(endDate))
}

function calculateEndDate(subject, assignment) {

  let endDate

  const { c_end_date_anchor, c_end_date } = assignment

  const publicUserDates = subject.c_set_dates

  if (c_end_date_anchor && c_end_date_anchor.c_template && publicUserDates) {

    const templateId = c_end_date_anchor.c_template._id

    const offset = c_end_date_anchor.c_offset || 0

    const setDate = publicUserDates.find(({ c_template }) => c_template._id.toString() === templateId.toString())

    if (setDate) {

      // currently only supports calendar day
      // we don't change the Timezone because Anchor Dates on Public User are already stored considering public user Timezone
      endDate = moment(setDate.c_date)
        .add(offset, 'd')
        .format('YYYY-MM-DD')
    }
  } else if (c_end_date) {

    endDate = moment
      .tz(c_end_date, subject.c_tz)
      .format('YYYY-MM-DD')

  }

  if (!endDate) {
    // this is a date in the future which makes end date always available
    // the end date is either
    // 1. set by anchor dates  if configured
    // 2. set by fixed end date in the assignment if configured
    // 3. set by default to the future if it is no configured by the previous options
    endDate = moment
      .tz(subject.c_tz) // accounts for subject timezone so it makes sure it retuns a future date
      .add(1, 'd')
      .format('YYYY-MM-DD')
  }

  return endDate

}

function calculateStartDate(subject, assignment) {

  let startDate

  const { c_start_date_anchor, c_start_date } = assignment

  const publicUserDates = subject.c_set_dates

  if (c_start_date_anchor && c_start_date_anchor.c_template && publicUserDates) {

    const templateId = c_start_date_anchor.c_template._id

    const offset = c_start_date_anchor.c_offset || 0

    const setDate = publicUserDates.find(({ c_template }) => c_template._id.toString() === templateId.toString())

    if (setDate) {

      // currently only supports calendar day
      // we don't change the Timezone because Anchor Dates on Public User are already stored considering public user Timezone
      startDate = moment(setDate.c_date)
        .add(offset, 'd')
        .format('YYYY-MM-DD')
    }
  } else if (c_start_date) {

    startDate = moment
      .tz(c_start_date, subject.c_tz)
      .format('YYYY-MM-DD')
  } else {
    // this is when start date on the assignment is "blank" (see AXONCONFIG-1249)

    if (subject.c_account) {

      startDate = moment(subject.c_account._id.toDate())
        .format('YYYY-MM-DD')
    }

  }

  return startDate
}

@transform('c_missed_task_transform')
class MissedTaskTransform {

  beforeAll(memo) {

  }

  afterAll(memo) {

  }

  @log({ traceError: true })
  each(subject, memo) {
    MissedTasks.createMissedTasksForSubject(subject, memo.assignmentsByGroup[subject.c_group._id.toString()])
  }

}

class MissedTasks {

  @log({ traceError: true })
  @on('c_create_missed_tasks_job')
  @job('0 0 * * *', { name: 'c_generate_tasks_job', principal: 'c_system_user' })
  generateUpcomingTasks({ context, runtime }) {

    const groupTasks = c_group_tasks.find({ c_use_time_window: true })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()

    const groups = [...groupTasks.reduce((a, v) => {
      a.add(v.c_group._id.toString())
      return a
    }, new Set())]

    const memo = {
      assignmentsByGroup: groups.reduce((a, v) => {
        a[v] = groupTasks.filter(i => i.c_group._id.equals(v))
        return a
      }, {})
    }

    // has to be an async task so it is also compatible with  events (see @on)
    return org.objects.bulk()
      .add(c_public_users.find({ c_group: { $in: groups }, c_account: { $exists: true } })
        .skipAcl()
        .grant(consts.accessLevels.read), { wrap: false })
      .transform({ autoPrefix: true, memo, script: 'c_missed_task_transform' })
      .async()
      .next()

  }

  @log({ traceError: true })
  @trigger('create.after', { object: 'c_public_user', weight: 1 })
  static newPublicUserTasks() {

    if (script.arguments.new.c_account) {
      const subject = c_public_users.find({ _id: script.context._id })
        .skipAcl()
        .grant(consts.accessLevels.read)
        .next()

      const c_group = pathsTo(subject, 'c_group._id')

      if (!c_group) return

      const groupTasks = c_group_tasks.find({ c_use_time_window: true, c_group })
        .skipAcl()
        .grant(consts.accessLevels.read)
        .toArray()

      if (groupTasks.length > 0) {

        MissedTasks.createMissedTasksForSubject(subject, groupTasks)
      }
    }

  }

  @log({ traceError: true })
  @trigger('update.after', {
    object: 'c_public_user',
    weight: 1,
    if: {
      $or: [
        {
          $gte: [{
            $indexOfArray: [
              '$$SCRIPT.arguments.modified',
              'c_account'
            ]
          }, 0]
        },
        {
          $gte: [{
            $indexOfArray: [
              '$$SCRIPT.arguments.modified',
              'c_group'
            ]
          }, 0]
        },
        {
          $gte: [{
            $indexOfArray: [
              '$$SCRIPT.arguments.modified',
              'c_set_dates'
            ]
          }, 0]
        },
        {
          $gte: [{
            $indexOfArray: [
              '$$SCRIPT.arguments.modified',
              'c_tz'
            ]
          }, 0]
        }
      ]
    }
  })
  static updatePublicUserTasks({ modified }) {

    const subject = c_public_users.find({ _id: script.context._id })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .next()

    // This is  deleting missed tasks that were previously created with a different TZ (or not TZ at all)
    // and then replacing them with the new missed tasks now calculated with the new TZ
    // For more details see AXONCONFIG-1178
    if (modified.includes('c_tz')) {
      c_missed_tasks.updateMany({
        c_public_user: script.context._id,
        c_due_before: {
          $gt: moment()
            .toISOString()
        }
      }, {
        $set: { c_invalid: true }
      })
        .skipAcl()
        .grant(consts.accessLevels.update)
        .execute()
    }

    const c_group = pathsTo(subject, 'c_group._id')

    if (!c_group) return

    const groupTasks = c_group_tasks.find({ c_use_time_window: true, c_group })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()

    if (groupTasks.length > 0) {

      MissedTasks.createMissedTasksForSubject(subject, groupTasks)
    }
  }

  @log({ traceError: true })
  @trigger('update.before',
    {
      object: 'c_task_response',
      weight: 1,
      if: {
        $ne: [
          {
            $pathTo: ['$$ROOT', 'c_group']
          },
          null
        ]
      }

    })
  static responseUpdate() {

    if (script.arguments.new.c_completed && !script.arguments.old.c_completed) {

      let c_group_task

      const taskResponse = c_task_responses.find({ _id: script.context._id })
        .skipAcl()
        .grant(consts.accessLevels.read)
        .expand('c_group_task')
        .paths('c_group_task._id', 'c_public_user._id', 'c_task._id', 'c_group._id', 'c_start', 'created')
        .passive()
        .next()

      const c_public_user = taskResponse.c_public_user._id

      if (taskResponse.c_group_task) {
        if (!taskResponse.c_group_task.c_use_time_window) {
          return
        }
        c_group_task = taskResponse.c_group_task._id
      } else {
        const gtSearch = {
          c_assignment: taskResponse.c_task._id,
          c_group: taskResponse.c_group._id,
          c_use_time_window: true
        }
        const gtCursor = c_group_tasks.find(gtSearch)
          .skipAcl()
          .grant(consts.accessLevels.read)

        if (!gtCursor.hasNext()) {
          return
        } else {
          c_group_task = gtCursor.next()._id
        }
      }

      const { c_start: startingTime, created: currentTime } = taskResponse

      const completionTime = startingTime || currentTime

      const mtSearch = {
        c_group_task,
        c_public_user
      }

      // there can only be one task because it is the missed task for this particular task only
      const [missedTask] = org.objects
        .c_missed_tasks
        .aggregate([
          {
            $match: mtSearch
          },
          {
            $sort: {
              created: -1
            }
          }
        ])
        .expressionPipeline([{
          $transform: {
            vars: {
              completionTime
            },
            each: {
              in: {
                $cond: [
                  {
                    $and: [
                      {
                        $or: [
                          {
                            $eq: [
                              {
                                $pathTo: ['$$ROOT', 'c_invalid']
                              },
                              null
                            ]
                          },
                          {
                            $eq: [
                              {
                                $pathTo: ['$$ROOT', 'c_invalid']
                              },
                              false
                            ]
                          }
                        ]
                      },
                      {
                        // we need to add 1 second to c_due_before because isBetween expression doesn't support `[]` inclusive configuration as the library does
                        $moment: ['$$completionTime', { isBetween: ['$$ROOT.c_due_after', { $moment: ['$$ROOT.c_due_before', { add: [1, 's'] }] }] }]
                      }
                    ]
                  },
                  '$$ROOT',
                  '$$REMOVE'
                ]
              }
            }
          }
        }])
        .toArray()

      if (!missedTask) return

      c_missed_tasks.updateOne({ _id: missedTask._id }, { $set: { c_invalid: true } })
        .skipAcl()
        .grant(consts.accessLevels.update)
        .execute()

    }
  }

  @log({ traceError: true })
  @as('c_system_user', asOptions)
  @on('c_create_missed_task')
  // given the time dependency on  this feature, we are passing a today variable for testing purposes
  // this variable allow firing this event at different moments
  static createMissedTasksForSubject(subject, assignments, now = moment()) {

    const subjectTZ = subject.c_tz || 'UTC'

    const logInformation = {
      subject,
      assignmentsAvailable: assignments,
      now: moment(now)
        .utc()
        .toString(),
      resultPerAssignment: assignments.map(({ _id }) => ({ _id }))
    }

    const userToday = moment(now)
      .tz(subjectTZ)
      .startOf('day')

    logInformation.userToday = userToday.toString()

    assignments
      .filter((v) => isTodayAvailable(subject, v, userToday, logInformation))
      .filter((v) => isInDateRange(subject, v, userToday, logInformation))
      .forEach((v) => {

        const taskWindowStart = moment(v.c_window_start, 'HH:mm')

        const taskWindowEnd = moment(v.c_window_end, 'HH:mm')

        const taskStart = moment(userToday)
          .hour(taskWindowStart.hour())
          .minutes(taskWindowStart.minutes())

        const taskEnd = moment(userToday)
          .hour(taskWindowEnd.hour())
          .minutes(taskWindowEnd.minutes())

        // map to what is was sent in createMissedTasksForSubject, specially for tests
        const currentTime = moment(now)

        const index = logInformation.resultPerAssignment.findIndex(({ _id }) => _id.toString() === v._id.toString())
        if (index >= 0) {
          // for debugging purposes
          logInformation.resultPerAssignment[index] = {
            ...logInformation.resultPerAssignment[index],
            taskStart: taskStart.toString(),
            taskEnd: taskEnd.toString(),
            currentTime: currentTime.toString(),
            isCurrentTimeAfterWindowEnd: currentTime.isAfter(taskEnd)
          }
        }

        let missedTask = {}

        if (currentTime.isAfter(taskEnd)) {
          // time window has ended there is no point in creating a missed task here
          // however we could create one for the next day unless next day is out of the assignment window

          taskStart.add(24, 'hours')
          taskEnd.add(24, 'hours')

          // we are going to create this missed task only if 24 hours later we are still in the task assignment range
          const endDate = calculateEndDate(subject, v)

          if (endDate) {

            const isAfterEndDate = moment(taskEnd.format('YYYY-MM-DD'))
              .isAfter(endDate)

            if (index >= 0) {
              // for debugging purposes
              logInformation.resultPerAssignment[index] = {
                ...logInformation.resultPerAssignment[index],
                isAfterEndDate
              }
            }

            if (isAfterEndDate) {

              // if we are out of range we don't create the missed task
              return
            }

          }

        } else if (currentTime.isBefore(taskEnd)) {
          // in this case we still have time to complete the task today but before
          // creating the missed task we need to check if the task response was already created

          const wasCompleted = wasTaskResponseCompleted(subject, v, taskStart, taskEnd)

          if (index >= 0) {
            // for debugging purposes
            logInformation.resultPerAssignment[index] = {
              ...logInformation.resultPerAssignment[index],
              wasCompleted
            }
          }

          if (wasCompleted) {

            // AXONCONFIG-1502: We invalidate the missed task instead of not creating it
            missedTask.c_invalid = true
          }
        }

        // don't move missedTask, taskStart and taskEnd are defined in the block above
        missedTask = {
          ...missedTask,
          c_due_after: moment(taskStart)
            .toISOString(),
          c_due_before: moment(taskEnd)
            .toISOString(),
          c_public_user: subject._id,
          c_group_task: v._id
        }

        if (subject.c_site) {
          missedTask.c_site = subject.c_site._id
        }

        const tasks = c_missed_tasks.find(missedTask)
          .skipAcl()
          .grant(consts.accessLevels.read)
          .toArray()

        const missedTaskExists = tasks.length && tasks.some(v => !v.c_invalid)

        if (index >= 0) {
          // for debugging purposes
          logInformation.resultPerAssignment[index] = {
            ...logInformation.resultPerAssignment[index],
            doesMissedTaskExist: missedTaskExists
          }
        }

        // So just in case, check this doesn't exist, otherwise create it
        if (!missedTaskExists) {

          // for debugging purposes
          if (index >= 0) {
            // for debugging purposes
            logInformation.resultPerAssignment[index] = {
              ...logInformation.resultPerAssignment[index],
              missedTask
            }
          }

          c_missed_tasks
            .insertOne(missedTask)
            .lean(false)
            .execute()

        }

      })

    if (script.env.name === 'development') {

      debug(logInformation)
    }
  }

}

module.exports = MissedTasks