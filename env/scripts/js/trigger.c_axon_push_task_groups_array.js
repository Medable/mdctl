/***********************************************************

@script     Axon - Push Task Groups Array

@brief      Trigger to add participant group to task groups array

@object     c_group_task

@on         Before Create

@author     Matt Lean     (Medable.MIL)

@version    4.2.0         (Medable.MIL)

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

var objects = require('objects');

var task = objects.read('c_tasks', script.arguments.new.c_assignment._id);
var groupId = script.arguments.new.c_group._id;

objects.push('c_tasks', task._id, {c_groups:[groupId]}, {grant: 7});