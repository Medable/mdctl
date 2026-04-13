/***********************************************************
@script     Axon - Splice Task Groups Array

@brief      Remove a group from a task object's c_groups array

@object     c_group_task

@on         Before Delete

@author     Nicolas Ricci    

@version    4.2.0                       

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/


import { id } from 'util'
const {c_groups_tasks, c_tasks} = org.objects,
       _id = script.context._id,
       c_group_task = org.objects.c_group_task.find({ _id }).paths('c_group','c_assignment.c_groups').next(),
       // need to confirm tasks exists before doing anything 
       taskId = c_group_task.c_assignment._id,
       taskCursor = c_tasks.find({ _id: taskId}).skipAcl().grant(consts.accessLevels.read),
       updatedGroups = taskCursor.hasNext() && id.diffIdArrays(c_group_task.c_assignment.c_groups, [ c_group_task.c_group._id ])
       
if(taskCursor && taskCursor.hasNext()) {
    c_tasks.updateOne({ _id:taskId }, {$set: { c_groups: updatedGroups } })
          .lean(true)
          .skipAcl(true)
          .grant(6)
          .execute()
}