import {
  trigger,
  log
} from 'decorators'

/* eslint-disable-next-line */
import logger from 'logger'
import nucUtils from 'c_nucleus_utils'
import faults from 'c_fault_lib'
import { id } from 'util'

const {
  c_studies,
  c_tasks,
  c_group_tasks,
  c_sites
} = org.objects

class GroupTaskLibrary {

  static validateSites(newSitesList) {
    console.log('validating sites')
    const numNewSites = newSitesList.length
    const newValidSites = c_sites.find({ _id: { $in: newSitesList } })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .count()

    if (numNewSites !== newValidSites) {
      faults.throw('axon.validationError.allSitesMustBeValid')
    }
  }

  @log({ traceError: true })
  @trigger('create.before', { object: 'c_group_task', weight: 1 })
  static beforeCreate({ new: newGroup }) {

    this.validateSites(newGroup.c_sites)

    // ensure assignment order on creation
    const c_group = newGroup.c_group._id

    let taskAssignments = c_group_tasks.find({ c_group })
      .paths('c_order', 'c_assignment.c_name')
      .limit(1000)
      .toArray()
      .sort(nucUtils.sortTaskAssignments)
      .map((v, i) => ({ _id: v._id, c_order: i + 1 }))

    script.arguments.new.update('c_order', taskAssignments.length + 1, { grant: consts.accessLevels.update })
    nucUtils.setTaskAssignmentOrder(c_group, taskAssignments)

  }

  @log({ traceError: true })
  @trigger('create.after', { object: 'c_group_task', weight: 1 })
  static afterCreate({ new: newGroupTask }) {

    try {
      c_tasks.updateOne({ _id: newGroupTask.c_assignment._id }, { $push: { c_groups: [newGroupTask.c_group._id] } })
        .skipAcl()
        .grant(consts.accessLevels.update)
        .execute()
    } catch (err) {
      // A failure here has no great effect so don't throw it.
    }
  }

  @log({ traceError: true })
  @trigger('update.before', { object: 'c_group_task', weight: 1 })
  static beforeUpdate({ new: newGroupTask }) {

  }

  @log({ traceError: true })
  @trigger('delete.before', { object: 'c_group_task', weight: 1 })
  static beforeDelete() {

    const _id = script.context._id
    const c_group_task = c_group_tasks.find({ _id })
      .paths('c_group', 'c_assignment.c_groups')
      .limit(1)
      .next()

    // Remove reference to the assignment from the tasks
    const taskId = c_group_task.c_assignment._id
    const taskCursor = c_tasks.find({ _id: taskId })
      .skipAcl()
      .grant(consts.accessLevels.read)
    const updatedGroups = taskCursor.hasNext() && id.diffIdArrays(c_group_task.c_assignment.c_groups, [ c_group_task.c_group._id ])

    if (taskCursor && taskCursor.hasNext()) {
      c_tasks.updateOne({ _id: taskId }, { $set: { c_groups: updatedGroups } })
        .lean(true)
        .skipAcl(true)
        .grant(6)
        .execute()
    }

    // Reorder assignments on deletion
    const taskAssignments = c_group_tasks.find({ c_group: c_group_task.c_group._id })
      .paths('c_order', 'c_assignment.c_name')
      .limit(1000)
      .toArray()
      .filter(v => !v._id.equals(_id))
      .sort(nucUtils.sortTaskAssignments)
      .map((v, i) => ({ _id: v._id, c_order: i + 1 }))

    nucUtils.setTaskAssignmentOrder(c_group_task.c_group._id, taskAssignments)

  }

}

module.exports = GroupTaskLibrary