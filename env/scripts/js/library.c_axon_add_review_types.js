import logger from 'logger'
import { id } from 'util'
import _ from 'underscore'
import { TaskResponse, Review } from 'c_dmweb_lib'
import nucUtils from 'c_nucleus_utils'
import faults from 'c_fault_lib'

class AddReviews {

  static executeAddReviews(taskResponseId, dryRun, checkSignEnabled = false, signature = {}) {
    const taskResponse = TaskResponse.getTaskResponse(taskResponseId) || faults.throw('axon.notFound.instanceNotFound'),
          studyId = taskResponse.c_study._id,
          taskResponseReviews = taskResponse.c_reviews.data,
          siteId = taskResponse.c_site._id,
          principalId = script.principal._id,
          rolesPerId = Object.keys(consts.roles)
            .filter(key => key.startsWith('c_'))
            .reduce((acc, name) => {
              const roleId = consts.roles[name]
              return { ...acc, [roleId]: name }
            }, {}),
          roles = nucUtils.getUserRolesSimple(principalId, siteId, studyId)
            .filter(roleId => rolesPerId[roleId] !== 'c_dm_app'),
          requiredReviews = Review.getReviewsByTaskResponse(taskResponseId)

    this.checkIfPrincipalAllowed(roles)
    this.checkIfOpenQueries(taskResponseId)
    const reviewType = this.getApplicableReviewType(requiredReviews, roles)
    if (checkSignEnabled) {
      signature.value.signer_role = (signature.value.signer_role.length > 0) ? signature.value.signer_role : roles
      signature.value.review_type_id = reviewType._id
      const existingReview = _.chain(taskResponseReviews)
        .filter(review => id.equalIds(review.c_review_type, reviewType._id))
        .first()
        .value()
      if (existingReview) {
        const checkIfInvalidate = Review.isItInvalidated(existingReview)
        if (!checkIfInvalidate) {
          this.checkifSignatureApplied(taskResponseId, roles)
        }
      }
    }
    if (checkSignEnabled && !reviewType.c_required_signature) {
      faults.throw('axon.invalidArgument.signatureFlagIsNotAvailable')
    }
    return this.addOrValidateReview(taskResponseReviews, reviewType._id, taskResponseId, principalId, dryRun, checkSignEnabled, signature) && true
  }

  static checkifSignatureApplied(taskResponseId, userroles) {

    const { c_signatures } = org.objects.c_task_responses.find({ _id: taskResponseId })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .paths('c_signatures.value')
      .next()

    const checkIfAlreadySigned = c_signatures.data
      .filter(singedRolArray => {
        const diff = id.intersectIdArrays(singedRolArray.value.signer_role, userroles)
        return diff.length > 0
      })
    if (checkIfAlreadySigned.length > 0) {
      faults.throw('axon.error.reviewAlreadyCompleted')
    }
  }

  static addOrValidateReview(reviews, reviewTypeId, taskResponseId, principalId, dryRun, checkSignEnabled, signature) {

    const existingReview = _.chain(reviews)
      .filter(review => id.equalIds(review.c_review_type, reviewTypeId))
      .first()
      .value()

    const validateReviewIfNecessary = () =>
      script.as(nucUtils.SystemUser.name,
        { },
        () => (Review.isItInvalidated(existingReview) &&
                  Review.validateReview(taskResponseId, existingReview._id)))

    const executeValidateReviewIfNecessary = () => {
      const success = validateReviewIfNecessary()
      if (success) {
        Review.pushReview(taskResponseId, reviewTypeId, principalId)
      }
      return success
    }

    // do not apply the review
    if (dryRun) {
      /**
       * If the review exists then user would only be able to apply it IF it is invalidated already
       * If the review does not exist then the user would be able to apply it no matter what
       */
      return existingReview ? Review.isItInvalidated(existingReview) : true
    }
    if (checkSignEnabled) {
      org.objects.c_task_responses.updateOne({ _id: taskResponseId }, { $set: { c_signatures: signature } })
        .skipAcl()
        .grant(consts.accessLevels.update)
        .execute()
    }

    return existingReview
      ? executeValidateReviewIfNecessary()
      : Review.pushReview(taskResponseId, reviewTypeId, principalId)
  }

  static checkIfPrincipalAllowed(roles) {
    return roles.length ||
      faults.throw('axon.accessDenied.notValidRoleToApplyReview')
  }

  static checkIfOpenQueries(taskResponseId) {
    const [openQuery] = TaskResponse.getQueries(taskResponseId, ['open', 'responded'])
    if (openQuery) faults.throw('axon.invalidArgument.openQueriesRestriction')
  }

  static getApplicableReviewType(requiredReviews, roles) {
    const userRoles = roles.map(role => role.toString())
    const applicableReviewTypes = requiredReviews
      .filter(requiredReview => {
        const filteredReviewRoles = requiredReview.c_roles ? requiredReview.c_roles.filter(role => role) : []

        if (filteredReviewRoles.length === 0) {
          return true
        }

        const requiredReviewRoles = filteredReviewRoles.map(role => role.toString())
        return _.intersection(requiredReviewRoles, userRoles).length > 0
      })
    if (applicableReviewTypes.length === 0) {
      faults.throw('axon.invalidArgument.unnecessaryReviewType')
    } else if (applicableReviewTypes.length > 1) {
      faults.throw('axon.invalidConfiguration.accountWronglyConfigured')
    } else {
      return applicableReviewTypes[0]
    }
  }

}

module.exports = AddReviews