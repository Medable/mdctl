/***********************************************************

@script     Axon - Hybrid - Set 'Reviewed'

@brief      Sets the Task Response to 'Reviewed' if condtions are met

@author     Nahuel Dealbera     (Medable.MIL)

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import logger from 'logger'
import _ from 'underscore'
import { id } from 'util'
import { ReviewType, TaskResponse } from 'c_dmweb_lib'
import { QueryStatus } from 'c_nucleus_query'
import nucUtils from 'c_nucleus_utils'

const setTaskResponseToReviewed = (taskResponse) => {

  const requiredReviews = ReviewType.getRequiredReviews(taskResponse.c_task._id, taskResponse.c_group._id)

  const appliedReviews = taskResponse
    .c_reviews
    .data
    .filter(r => !_.has(r, 'c_invalidated_at'))
    .map(r => r.c_review_type)

  const allReviewsApplied =
            id.diffIdArrays(requiredReviews, appliedReviews).length === 0

  const noOpenQueries = taskResponse
    .c_queries
    .data
    .filter(q => q.c_status !== QueryStatus.Closed && q.c_status !== QueryStatus.ClosedRequery)
    .length === 0

  // this script can only set to 'Reviewed' those task responses that
  //  A) No required reviews
  //  1. No required reviews
  //  2. No open queries
  //  B) Required Reviews
  //  1. All reviews applied
  //  2. No open queries

  const hasNoReqReviews = requiredReviews.length === 0 && noOpenQueries

  const reviewsCompleted = requiredReviews.length > 0 && noOpenQueries && allReviewsApplied

  if (hasNoReqReviews || reviewsCompleted) {

    TaskResponse.setStatus(taskResponse._id, 'Reviewed')
  }

}

const { new: newTaskResponse } = script.arguments

const taskResponse = TaskResponse.getTaskResponse(newTaskResponse._id)

const isComplete = taskResponse.c_status === 'Complete'

if (!isComplete) return

const { c_study: study, c_task: task } = taskResponse

if (!study) return

const [studyInstance] = org.objects
  .c_study
  .find({ _id: study._id })
  .paths('c_review_types')
  .skipAcl()
  .grant('read')
  .toArray()

const oldReviewsTypes = studyInstance.c_review_types || []
const allReviewTypes = nucUtils.fetchNewReviewTypes(task._id, oldReviewsTypes)
const hasReviewsConfigured = allReviewTypes.length > 0
if (!hasReviewsConfigured) return

setTaskResponseToReviewed(taskResponse)