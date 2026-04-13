/***********************************************************

 @script     Axon - Task Assignment Order on Delete

 @brief      Trigger to reset a group's task assignment order on a deletion

 @author     Fiachra Matthews

 (c)2019 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import logger from 'logger'
import c_nuc_utils from 'c_nucleus_utils'

const { c_group_tasks } = org.objects
const _id = script.context._id
const c_group_task = c_group_tasks.readOne({ _id })
  .paths('c_group')
  .execute()

const taskAssignments = c_group_tasks.find({ c_group: c_group_task.c_group._id })
  .paths('c_order', 'c_assignment.c_name')
  .limit(1000)
  .toArray()
  .filter(v => !v._id.equals(_id))
  .sort(c_nuc_utils.sortTaskAssignments)
  .map((v, i) => ({ _id: v._id, c_order: i + 1 }))

c_nuc_utils.setTaskAssignmentOrder(c_group_task.c_group._id, taskAssignments)