/***********************************************************

 @script     Axon - Task Assignments Library

 @brief      Provides a method for fetching task assignments for public user
             in a specific group.  Task assignments are returned within a
             wrapper object which includes all the information the client needs
             to evaluate flow and schedule rules.

 @author     Pete Richards

 @exports    getTaskAssignments(groupId, publicUserId)

 (c)2019 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import { accessLevels } from 'consts'
import { paths } from 'util'
import moment from 'moment.timezone'

/* TODO: Test cases

 group containing:
 * task with no completions
 * task with one completion
 * task with no steps
 * task with steps
 * task with no branches
 * task with branches
 */

// Returns a map of tasks by id, with c_steps and c_branches expanded.
// Workaround for permissions issue with expand clause.
function getExpandedTasks(taskIds) {

  if (!taskIds.length) {
    return []
  }

  let tasks = org.objects.c_tasks
    .find({
      _id: {
        $in: taskIds
      }
    })
    .limit(taskIds.length)
    .skipAcl()
    .grant(accessLevels.read)
    .toArray()
    .reduce((taskMap, task) => {
      taskMap[task._id] = task
      return taskMap
    }, {})

  let taskSteps = org.objects.c_steps
    .find({
      c_task: {
        $in: taskIds
      }
    })
    .limit(1000)
    .sort({
      c_order: 1
    })
    .skipAcl()
    .grant(accessLevels.read)
    .toArray()
    .reduce((stepMap, step) => {
      if (!stepMap[step.c_task._id]) {
        stepMap[step.c_task._id] = []
      }
      stepMap[step.c_task._id].push(step)
      return stepMap
    }, {})

  let taskBranches = org.objects.c_branches
    .find({
      c_task: {
        $in: taskIds
      }
    })
    .limit(1000)
    .skipAcl()
    .grant(accessLevels.read)
    .toArray()
    .reduce((branchMap, branch) => {
      if (!branchMap[branch.c_task._id]) {
        branchMap[branch.c_task._id] = []
      }
      branchMap[branch.c_task._id].push(branch)
      return branchMap
    }, {})

  // Merge results back into expanded task objects.
  Object.values(tasks)
    .forEach(task => {
      task.c_steps = {
        object: 'list',
        data: taskSteps[task._id] || [],
        hasMore: false
      }
      task.c_branches = {
        object: 'list',
        data: taskBranches[task._id] || [],
        hasMore: false
      }
    })

  return tasks
}

function getTaskResponseSummary(taskIds, groupId, publicUserId) {
  if (!publicUserId) {
    return {
      lastResponses: {},
      completionCounts: {}
    }
  }

  let responseSummaries = org.objects.c_task_responses.aggregate()
    .match({
      c_task: {
        $in: taskIds
      },
      c_completed: true,
      c_group: groupId,
      c_public_user: publicUserId
    })
    .sort({
      created: -1
    })
    .group({
      _id: 'c_task',
      completedCount: {
        $count: 'c_completed'
      },
      taskResponse: {
        $first: '_id'
      }
    })
    .skipAcl()
    .grant(accessLevels.read)
    .toArray()

  let completionCounts = responseSummaries
    .reduce((completionMap, summary) => {
      completionMap[summary._id._id] = summary.completedCount
      return completionMap
    }, {})

  let lastResponses = org.objects.c_task_responses
    .find({
      _id: {
        $in: responseSummaries.map(response => response.taskResponse)
      }
    })
    .skipAcl()
    .grant(accessLevels.read)
    .toArray()
    .reduce((responseMap, response) => {
      responseMap[response.c_task._id] = response
      return responseMap
    }, {})

  return {
    lastResponses,
    completionCounts
  }
}

function updateGroupTasksWithAnchorDate(groupTask, publicUser) {

  if (publicUser && (groupTask.c_start_date_anchor || groupTask.c_end_date_anchor)) {
    const setDates = publicUser.c_set_dates
    if (groupTask.c_start_date_anchor && groupTask.c_start_date_anchor.c_template) {
      let setDate = setDates.find(v => v.c_template._id.equals(groupTask.c_start_date_anchor.c_template._id))
      if (setDate) {
        groupTask.c_start_date = moment(setDate.c_date)
          .add(groupTask.c_start_date_anchor.c_offset, 'days')
          .format('YYYY-MM-DD')

        if (groupTask.c_end_date_anchor && groupTask.c_end_date_anchor.c_template) {
          let setDate = setDates.find(v => v.c_template._id.equals(groupTask.c_end_date_anchor.c_template._id))

          if (setDate) {
            groupTask.c_end_date = moment(setDate.c_date)
              .add(groupTask.c_end_date_anchor.c_offset, 'days')
              .format('YYYY-MM-DD')
          }
        }
      } else {
        groupTask.c_start_date = '1970-01-01'
        groupTask.c_end_date = '1970-01-01'
      }
    } else if (groupTask.c_end_date_anchor && groupTask.c_end_date_anchor.c_template) {
      let setDate = setDates.find(v => v.c_template._id.equals(groupTask.c_end_date_anchor.c_template._id))

      if (setDate) {
        groupTask.c_end_date = moment(setDate.c_date)
          .add(groupTask.c_end_date_anchor.c_offset, 'days')
          .format('YYYY-MM-DD')
      }
    }
  }

  return groupTask

}

function getTaskAssignments(groupId, publicUserId) {

  const publicUser = org.objects
    .c_public_users
    .find({ _id: publicUserId })
    .skipAcl()
    .grant(consts.accessLevels.read)
    .next()

  const siteId = paths.to(publicUser, 'c_site._id')

  let groupTasks = org.objects.c_group_tasks
    .find({
      c_group: groupId
    })
    .sort({ c_order: 1 })
    .skipAcl()
    .grant(accessLevels.read)
    .toArray()
    .filter(groupTask => {
      if (groupTask.c_site) {
        return groupTask.c_site._id.equals(siteId)
      } else if (groupTask.c_sites && groupTask.c_sites.length) {
        return !!groupTask.c_sites.find(v => v.equals(siteId))
      }
      return true
    })

  let assignedTaskIds = groupTasks.map(groupTask => groupTask.c_assignment._id.toString())
  let tasks = getExpandedTasks(assignedTaskIds)
  let responseSummary = getTaskResponseSummary(assignedTaskIds, groupId, publicUserId)

  const assignments = groupTasks.map(groupTask => {
    let taskId = groupTask.c_assignment._id.toString()
    groupTask.c_assignment = tasks[taskId]
    groupTask = updateGroupTasksWithAnchorDate(groupTask, publicUser)
    let task_assignment = {
      object: 'c_task_assignment_wrapper',
      c_group_task: groupTask,
      last_response: responseSummary.lastResponses[taskId],
      completed_count: responseSummary.completionCounts[taskId] || 0
    }
    return task_assignment
  })

  // For deactivated participants remove all uncompleted task assignments
  if (publicUser.c_status === 'Deactivated') {
    return assignments.filter(item => item.completed_count > 0)
  }
  return assignments
}

module.exports = {
  getTaskAssignments
}