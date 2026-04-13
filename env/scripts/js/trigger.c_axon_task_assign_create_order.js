/***********************************************************

 @script     Axon - Task Assignment Order on Creation

 @brief      An on create trigger to set the order of a task assignment

 @author     Fiachra Matthews

 (c)2019 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import logger from 'logger'
import c_nuc_utils from 'c_nucleus_utils'

const { c_group_tasks } = org.objects
const c_group = script.arguments.new.c_group._id

let taskAssignments = c_group_tasks.find({ c_group })
  .paths('c_order', 'c_assignment.c_name')
  .limit(1000)
  .toArray()
  .sort(c_nuc_utils.sortTaskAssignments)
  .map((v, i) => ({ _id: v._id, c_order: i + 1 }))

script.arguments.new.update('c_order', taskAssignments.length + 1, { grant: consts.accessLevels.update })
c_nuc_utils.setTaskAssignmentOrder(c_group, taskAssignments)