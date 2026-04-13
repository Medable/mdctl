/***********************************************************

@script     Axon - Hybrid - Add review

@brief      Adds a new review to Task Response

@author     Nahuel Dealbera     (Medable.MIL)

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import logger from 'logger'
import req from 'request'
import AddReviews from 'c_axon_add_review_types'

// Dependencies
const taskResponseId = req.body.c_task_response
const dryRun = (req.body.options && req.body.options.dryRun) || false

return AddReviews.executeAddReviews(taskResponseId, dryRun)