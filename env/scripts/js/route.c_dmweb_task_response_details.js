import request from 'request'
import { paths, id } from 'util'
import _ from 'underscore'
import { TaskResponse } from 'c_dmweb_lib'
import { QueryStatus } from 'c_nucleus_query'
import moment from 'moment'
import logger from 'logger'
import faults from 'c_fault_lib'
import nucUtils from 'c_nucleus_utils'

const { params: { taskResponseId }, query: { closedQueries } } = request
if (taskResponseId && !id.isIdFormat(taskResponseId)) {
  faults.throw('axon.invalidArgument.invalidObjectId')
}
const arrayOfResponses = org.objects.c_task_response.find({ _id: taskResponseId })
  .skipAcl()
  .grant(consts.accessLevels.read)
  .paths('c_site', 'c_signatures')
  .toArray()

if (arrayOfResponses.length === 0) {
  faults.throw('axon.notFound.instanceNotFound')
}
const signedDetails = paths.to(arrayOfResponses, '0.c_signatures.data') || []
let c_signed = false
let signed_details = []
const c_site = paths.to(arrayOfResponses, '0.c_site') || {},
      defaultQueryStatus = [QueryStatus.Open, QueryStatus.Responded],
      queryStatus = closedQueries ? defaultQueryStatus.concat([QueryStatus.Closed, QueryStatus.ClosedRequery]) : defaultQueryStatus,
      pipeline = [
        { $match: { _id: c_site._id } },
        {
          $project: {
            c_task_responses: {
              $expand: {
                limit: 1000,
                pipeline: [
                  { $match: { _id: taskResponseId } },
                  {
                    $project: {
                      c_status: 1,
                      c_account: 1,
                      creator: 1,
                      c_clean_status: 1,
                      c_observation_type: 1,
                      c_start: 1,
                      created: 1,
                      c_end: 1,
                      c_site: {
                        $expand: ['c_name', 'c_number']
                      },
                      c_study: {
                        $expand: {
                          c_review_types: 1
                        }
                      },
                      c_public_user: {
                        $expand: ['c_number']
                      },
                      c_visit: {
                        $expand: ['c_name']
                      },
                      c_reviews: 1,
                      c_number: 1,
                      c_task: {
                        $expand: ['c_name']
                      },
                      c_queries: {
                        $expand: {
                          limit: 1000,
                          pipeline: [
                            {
                              $match: {
                                $and: [{ c_status: { $in: queryStatus } }, { c_step_response: { $exists: false } }]
                              }
                            },
                            {
                              $project: {
                                c_number: 1,
                                c_status: 1,
                                c_description: 1,
                                c_response: 1,
                                c_responded_by: {
                                  $expand: {
                                    c_public_identifier: 1
                                  }
                                },
                                c_responded_datetime: 1,
                                created: 1,
                                c_closing_reason: 1,
                                c_closed_datetime: 1,
                                c_closed_by: {
                                  $expand: {
                                    c_public_identifier: 1
                                  }
                                },
                                creator: {
                                  $expand: {
                                    c_public_identifier: 1
                                  }
                                }
                              }
                            }]
                        }
                      }
                    }
                  }
                ]
              }
            }
          }
        }]
let cursor
const availableRoleIds = nucUtils.getUserRolesSimple(script.principal._id, c_site._id)
const checkIfAlreadySigned = signedDetails
  .filter(singedRolArray => {
    const diff = id.intersectIdArrays(singedRolArray.value.signer_role, availableRoleIds)
    return diff.length > 0
  })
if (checkIfAlreadySigned.length > 0) {
  c_signed = true
  signed_details = signedDetails
}
if (nucUtils.isNewSiteUser(availableRoleIds)) {
  cursor = org.objects.accounts.aggregate(pipeline)
    .pathPrefix(`${script.principal._id}/c_sites`)
} else {
  cursor = org.objects.c_site.aggregate(pipeline)
}
const taskResponse = paths.to(cursor.toArray(), '0.c_task_responses.data.0') || {}
const oldReviewTypes = paths.to(taskResponse, 'c_study.c_review_types')
const allReviews = nucUtils.fetchNewReviewTypes(paths.to(taskResponse, 'c_task._id'), oldReviewTypes)
const requiredReviewIds = TaskResponse.getGroupTaskRequiredReviews(taskResponseId),
      createTaskResponseWrapper = (taskResponse, locks, allReviews) => {
        return ({
          _id: paths.to(taskResponse, '_id'),
          c_site: paths.to(taskResponse, 'c_site'),
          c_account: paths.to(taskResponse, 'c_account'),
          c_creator: paths.to(taskResponse, 'creator'),
          c_public_user: paths.to(taskResponse, 'c_public_user'),
          c_number: paths.to(taskResponse, 'c_number'),
          c_visit: paths.to(taskResponse, 'c_visit'),
          c_status: paths.to(taskResponse, 'c_status'),
          c_clean_status: paths.to(taskResponse, 'c_clean_status'),
          c_observation_type: paths.to(taskResponse, 'c_observation_type'),
          c_task: paths.to(taskResponse, 'c_task'),
          c_queries: paths.to(taskResponse, 'c_queries'),
          c_start: paths.to(taskResponse, 'c_start'),
          created: paths.to(taskResponse, 'created'),
          c_end: paths.to(taskResponse, 'c_end'),
          c_study: {
            _id: paths.to(taskResponse, 'c_study._id')
          },
          c_signed: c_signed,
          c_signed_details: signed_details,
          reviews: _.chain(allReviews)
            .filter(reviewType => reviewType.c_active && id.inIdArray(requiredReviewIds, reviewType._id))
            .map(reviewType => ({
              _id: reviewType._id,
              c_name: reviewType.c_name,
              c_roles: reviewType.c_roles,
              c_required_signature: reviewType.c_required_signature || false,
              is_reviewed: paths.to(taskResponse, 'c_reviews.data')
                .filter(r => id.equalIds(r.c_review_type, reviewType._id) && !r.hasOwnProperty('c_invalidated_at'))
                .length > 0
            }))
            .value(),
          c_locks: {
            data: locks
          }
        })
      }

const canReadTR = Object.keys(taskResponse).length
if (!canReadTR) return {}

let locks = []

const siteId = paths.to(taskResponse, 'c_site._id')
const publicUserId = paths.to(taskResponse, 'c_public_user._id')
const studyId = paths.to(taskResponse, 'c_study._id')

const possibleLockIds = [siteId, publicUserId, studyId].filter(_id => _id)

if (possibleLockIds.length) {
  locks = org.objects.c_locks.find({ c_locked_object_id: { $in: possibleLockIds } })
    .skipAcl()
    .grant(consts.accessLevels.read)
    .toArray()
}
return createTaskResponseWrapper(taskResponse, locks, allReviews)