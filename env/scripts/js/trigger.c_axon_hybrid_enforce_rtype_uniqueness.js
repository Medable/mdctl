import logger from 'logger'
import _ from 'underscore'
import { ReviewType } from 'c_dmweb_lib'
import { id } from 'util'
import faults from 'c_fault_lib'

const oldReviewTypes = script.arguments.old.c_review_types
const newReviewTypes = script.arguments.new.c_review_types
if (!newReviewTypes) return // do not check if there are not new review types

const currentRoles = ReviewType.getActiveReviewsField(oldReviewTypes, 'c_roles')

const newReviewType = ReviewType.areReviewTypesAdded(oldReviewTypes, newReviewTypes)
const modifiedReviewType = ReviewType.areReviewTypeRolesModified(oldReviewTypes, newReviewTypes)

const checkIfRolesIntersect = (arrOfRoles1, arrOfRoles2) => {
  id.intersectIdArrays(arrOfRoles1, arrOfRoles2).length > 0 &&
        faults.throw('axon.invalidArgument.repeatedRolesRestriction')
}

if (newReviewType) {
  checkIfRolesIntersect(currentRoles, newReviewType.c_roles)
} else if (modifiedReviewType) {
  const oldModifiedReviewType = id.findIdInArray(oldReviewTypes, '_id', modifiedReviewType._id)
  const rolesDifference = id.diffIdArrays(modifiedReviewType.c_roles, oldModifiedReviewType.c_roles)
  const currentRolesWithoutModifiedReviewRoles = id.diffIdArrays(currentRoles, modifiedReviewType.c_roles)

  rolesDifference.length > 0
    ? checkIfRolesIntersect(currentRoles, rolesDifference)
    : checkIfRolesIntersect(currentRolesWithoutModifiedReviewRoles, modifiedReviewType.c_roles)
}