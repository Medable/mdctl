/***********************************************************

 @script     Axon - Update Task Assignment Order

 @brief      Update the order of the task assgnment for  a given group

 @author     Fiachra Matthews

 @body

    {
        c_group: '<group id>',
        taskAssignments: [
           {
               _id:<group task id>,
               c_order: <desired order position of task assignment>
           },
           ...
        ]
    }

@response
    {
        "object": "list",
        "data": [
            {
                "_id": "5c8beabc5537f20100a6243c",
                "object": "c_group_task",
                "c_schedule": "always_available",
                "c_assignment": {
                    "_id": "5c8beab05537f20100a6230f",
                    "object": "c_task",
                    "c_name": "Task A"
                },
                "c_order": 0
            },
            {
                "_id": "5c8beabd5537f20100a62440",
                "object": "c_group_task",
                "c_schedule": "always_available",
                "c_assignment": {
                    "_id": "5c8beab05537f20100a6230f",
                    "object": "c_task",
                    "c_name": "Task B"
                },
                "c_order": 1
            },
            {
                "_id": "5c8beabe5537f20100a62444",
                "object": "c_group_task",
                "c_schedule": "one_time",
                "c_assignment": {
                    "_id": "5c8beab05537f20100a6230f",
                    "object": "c_task",
                    "c_name": "Task C"
                },
                "c_order": 2
            }
        ]
    }
 (c)2019 Medable, Inc.  All Rights Reserved.

 ***********************************************************/

import logger from 'logger'
import request from 'request'
import c_nuc_utils from 'c_nucleus_utils'

const { taskAssignments, c_group } = request.body

return c_nuc_utils.setTaskAssignmentOrder(c_group, taskAssignments)