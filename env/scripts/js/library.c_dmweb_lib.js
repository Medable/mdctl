/* eslint-disable no-prototype-builtins */
import logger from 'logger'
import { id, paths } from 'util'
import _ from 'underscore'
import nucUtils from 'c_nucleus_utils'
import { property } from 'lodash'

const ReviewType = {

  getRequiredReviews(taskId, groupId) {
    const [firstGroupTask] = org.objects
      .c_group_tasks
      .find({ 'c_assignment._id': taskId, 'c_group._id': groupId })
      .paths('c_required_reviews')
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()

    const oldReviews = firstGroupTask ? firstGroupTask.c_required_reviews : []
    const newReviewType = org.objects.c_review_type
      .find({ c_task_list: { $in: [taskId.toString()] }, c_active: true })
      .paths('_id')
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()
    const allReviewTypes = _.map(newReviewType, _.property('_id'))
    return [...allReviewTypes, ...oldReviews]
  },

  getActiveReviewsField(reviewTypes, field) {
    return _.chain(reviewTypes)
      .filter((reviewType) => reviewType.c_active)
      .pluck(field)
      .flatten()
      .value()
  },

  areReviewTypesAdded(oldReviewTypes, newReviewTypes) {
    const isNewReviewTypeAdded = id.diffIdArrays(this.getActiveReviewsField(newReviewTypes, '_id'),
      this.getActiveReviewsField(oldReviewTypes, '_id'))

    return id.findIdInArray(newReviewTypes, '_id', isNewReviewTypeAdded.pop())
  },

  areReviewTypeRolesModified(oldReviewTypes, newReviewTypes) {

    const areRolesEqual = (oldRoles, newRoles) => {
      return oldRoles.length === newRoles.length &&
                id.diffIdArrays(newRoles, oldRoles).length === 0
    }

    const areDifferent = _.chain(oldReviewTypes)
      .filter((reviewType) => reviewType.c_active)
      .reduce((diff, oldReviewType) => {
        const newReviewType = id.findIdInArray(newReviewTypes, '_id', oldReviewType._id)
        const areEqual = areRolesEqual(oldReviewType.c_roles, newReviewType.c_roles)
        return diff.concat(areEqual ? [] : [newReviewType && newReviewType._id])
      }, [])
      .compact()
      .value()

    return id.findIdInArray(newReviewTypes, '_id', areDifferent.pop())
  }

}

const TaskResponse = {

  TASK_RESPONSE_CLEAN_STATUS: {
    CLEAN: 'clean',
    UNRESOLVED_QUERIES: 'unresolved_queries',
    NEEDS_REVIEW: 'needs_review'
  },

  isPropPresent(propName) {
    const [schemaFound] = org.objects.object.find({ name: 'c_task_response' })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()
    const schemaProperties = schemaFound ? schemaFound.properties : []
    const searchedProp = schemaProperties.find(prop => prop.name === propName.toLowerCase())

    return Boolean(searchedProp)
  },

  getTaskResponse(taskResponseId) {
    return org.objects.c_task_response
      .aggregate()
      .match({ _id: taskResponseId })
      .project({
        c_reviews: {
          $expand: {
            limit: 1000,
            paths: ['c_task_response',
              'c_review_type',
              'c_reviewer',
              'c_date',
              'c_invalidated_at']
          }
        },
        c_queries: {
          $expand: {
            limit: 1000,
            paths: ['c_status']
          }
        },
        c_task: 1,
        c_group: 1,
        c_study: 1,
        c_site: 1,
        c_status: 1
      })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()[0]
  },

  setStatus(taskResponseId, status) {
    return org.objects
      .c_task_response
      .updateOne({ _id: taskResponseId }, { $set: { c_status: status } })
      .skipAcl()
      .grant(consts.accessLevels.delete)
      .execute()
  },

  getGroupTaskRequiredReviews(taskResponseId) {

    const [taskResponse] = org.objects
      .c_task_response
      .aggregate()
      .match({ _id: taskResponseId })
      .project({ 'c_group._id': 1, 'c_task._id': 1 })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()

    const { c_group, c_task } = taskResponse || {}

    return c_group && c_task
      ? ReviewType.getRequiredReviews(c_task._id, c_group._id)
      : []
  },

  calculateCurrentCleanStatus(taskResponseId, partiallyCalculated = {}) {

    const isTaskResponsePresent = partiallyCalculated.taskResponse &&
      partiallyCalculated.taskResponse.c_group &&
        partiallyCalculated.taskResponse.c_task &&
          partiallyCalculated.taskResponse.c_reviews

    let taskResponse

    if (!isTaskResponsePresent) {

      taskResponse = org.objects.c_task_response
        .aggregate([{ $match: { _id: taskResponseId } },
          {
            $project: {
              c_group: 1,
              c_task: 1,
              c_reviews: 1
            }
          }])
        .skipAcl()
        .grant(consts.accessLevels.read)
        .next()

    } else {

      taskResponse = partiallyCalculated.taskResponse

    }

    const areQueriesCalculated = !!partiallyCalculated.queries

    let openRespondedQueries

    if (!areQueriesCalculated) {

      const queries = org.objects.c_queries
        .find({ 'c_task_response._id': taskResponseId, c_status: { $in: ['open', 'responded'] } })
        .skipAcl()
        .grant(consts.accessLevels.read)
        .toArray()

      openRespondedQueries = queries.length

    } else {

      openRespondedQueries = partiallyCalculated.queries.length
    }

    if (openRespondedQueries) {

      return this.TASK_RESPONSE_CLEAN_STATUS.UNRESOLVED_QUERIES

    }

    const arePendingReviewsCalculated = !!partiallyCalculated.pendingReviews

    let pendingReviews

    if (!arePendingReviewsCalculated) {

      // required reviews can only be calculated when there is a group task, if group
      // is not specified then it means we are using ATS and therefore reviews can't
      // be calculated, to be addressed in future User Story
      if (!taskResponse.c_group) {

        pendingReviews = false

      } else {
        const requiredReviews = ReviewType.getRequiredReviews(taskResponse.c_task._id, taskResponse.c_group._id)

        const isNotInvalidated = r => !_.has(r, 'c_invalidated_at')

        const reviews = paths.to(taskResponse, 'c_reviews.data') || []

        const appliedReviews = reviews
          .filter(isNotInvalidated)
          .map(({ c_review_type }) => c_review_type)

        pendingReviews = requiredReviews.length
          ? id.diffIdArrays(requiredReviews, appliedReviews).length
          : false
      }

    } else {

      pendingReviews = partiallyCalculated.pendingReviews

    }

    if (pendingReviews) {

      return this.TASK_RESPONSE_CLEAN_STATUS.NEEDS_REVIEW

    }

    return this.TASK_RESPONSE_CLEAN_STATUS.CLEAN
  },

  getQueries(taskResponseId, statuses) {

    const queries = org.objects.c_queries
      .find({ 'c_task_response._id': taskResponseId, c_status: { $in: statuses } })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()

    return queries

  }

}

const Review = {

  isItInvalidated(review) {
    return review.hasOwnProperty('c_invalidated_at')
  },

  validateReview(taskResponseId, reviewId) {

    return org.objects
      .c_task_response
      .updateOne({ _id: taskResponseId }, { $unset: { [`c_reviews/${reviewId}/c_invalidated_at`]: 1 } })
      .skipAcl()
      .grant(consts.accessLevels.update)
      .execute()

  },

  pushReview(taskResponseId, reviewTypeId, principalId) {
    return org.objects
      .c_task_response
      .updateOne({ _id: taskResponseId },
        {
          $push: {
            c_reviews: {
              c_task_response: {
                _id: taskResponseId
              },
              c_review_type: reviewTypeId,
              c_reviewer: {
                _id: principalId
              },
              c_date: new Date()
                .toISOString()
            }
          }
        })
      .skipAcl()
      .grant(consts.accessLevels.delete)
      .execute()
  },

  invalidateReviewsByTaskResponse(taskResponseId) {
    const affectedReviewIds = org.objects
            .c_reviews
            .aggregate()
            .match({ 'c_task_response._id': taskResponseId, c_invalidated_at: { $exists: false } })
            .project({ _id: 1 })
            .skipAcl()
            .grant(consts.accessLevels.update)
            .limit(false)
            .toArray(),

          areReviewsAffected = affectedReviewIds.length > 0,

          invalidationDate = new Date()
            .toISOString()

    if (!areReviewsAffected) {
      return []
    }

    return org.objects
      .c_reviews
      .updateMany({ _id: { $in: [..._.pluck(affectedReviewIds, '_id')] } },
        { $set: { c_invalidated_at: invalidationDate } })
      .skipAcl()
      .grant(consts.accessLevels.update)
      .execute()
  },

  getReviewsByTaskResponse(taskResponseId) {
    const [taskResponse] = org.objects
      .c_task_response
      .find({ _id: taskResponseId })
      .expand('c_study')
      .limit(1)
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()

    const studyId = taskResponse.c_study._id
    const taskId = taskResponse.c_task._id
    const [study] = org.objects.c_study
      .find({ _id: studyId })
      .paths('c_review_types')
      .limit(1)
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()

    const availableReviews = study.c_review_types
      .filter(reviewType => !reviewType.hasOwnProperty('c_active') || reviewType.c_active)

    const requiredReviews = TaskResponse.getGroupTaskRequiredReviews(taskResponseId)

    const newReviewTypes = nucUtils.fetchNewReviewTypes(taskId, availableReviews)

    return requiredReviews
      .map(reviewTypeId => newReviewTypes
        .find(reviewType => {
          return reviewType._id.equals(reviewTypeId)
        }))
      .filter(reviewTypeId => reviewTypeId)
  }

}

const StepResponse = {
  getReadableTypesForUser(principalId, siteId) {

    const availableRoleIds = nucUtils.getUserRolesSimple(principalId, siteId)

    const allowedTypeNames = org.objects.objects
      .find({ name: 'c_step_response' })
      .paths('objectTypes')
      .skipAcl()
      .grant(consts.accessLevels.read)
      .next()
      .objectTypes
      .map(t => {
        const node = t.properties.find(v => v.name === 'c_value'),
              name = node && t.name,
              readingRoleIds = node.acl
                .filter(acl => acl.type === 3 && acl.allow >= 4)
                .map(acl => acl.target),
              intersection = id.intersectIdArrays(availableRoleIds, readingRoleIds),
              canAtLeastOneRoleRead = intersection.length > 0
        if (canAtLeastOneRoleRead) {
          return name
        }
        return undefined
      })
      .filter(v => v)
    return allowedTypeNames
  },

  canReadStepTypeProp(principalId, siteId, stepType, prop) {
    let site
    const availableUserRoleIds = nucUtils.getUserRolesSimple(principalId, siteId)
    if (nucUtils.isNewSiteUser(availableUserRoleIds)) {
      site = org.objects.accounts
        .find()
        .pathPrefix(`${principalId}/c_sites/${siteId}`)
        .paths('c_study', 'accessRoles')
        .limit(1)
        .toArray()[0]
    } else {
      site = org.objects.c_site
        .find({ _id: siteId })
        .paths('c_study', 'accessRoles')
        .limit(1)
        .toArray()[0]
    }

    if (!site) return false

    const stepTypeFound = org.objects.objects
      .find({ name: 'c_step_response' })
      .paths('objectTypes')
      .skipAcl()
      .grant(consts.accessLevels.read)
      .next()
      .objectTypes
      .find(objectType => objectType.name === stepType)

    if (!stepTypeFound) return false

    const propFound = stepTypeFound.properties.find(property => property.name === prop)

    if (!propFound) return false

    const availableRoleIds = site.accessRoles

    const readingRoleIds = propFound.acl
      .filter(acl => acl.type === 3 && acl.allow >= 4)
      .map(acl => acl.target)

    const intersection = id.intersectIdArrays(availableRoleIds, readingRoleIds)

    return intersection.length > 0

  }
}

module.exports = {
  ReviewType,
  TaskResponse,
  Review,
  StepResponse
}