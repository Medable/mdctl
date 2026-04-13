import {
  trigger,
  log
} from 'decorators'

import faults from 'c_fault_lib'
import _ from 'lodash'

const {
  c_review_type
} = org.objects

class ValidateReviewType {

  static checkIfRolesAreEqual(arrOfRoles1, arrOfRoles2) {
    if (arrOfRoles1.length !== arrOfRoles2.length) {
      return false
    }

    return _.isEqual(arrOfRoles1.sort(), arrOfRoles2.sort())
  }

  @log({ traceError: true })
  @trigger('create.before', { object: 'c_review_type', weight: 1, inline: true })
  static validateReviewTypeBeforeCreate() {
    const newReviewTypeName = script.arguments.new.c_name
    const newReviewTypeRequiredSignature = script.arguments.new.c_required_signature
    const newReviewTypeRoles = script.arguments.new.c_roles

    const allReviewTypes = c_review_type.find()
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()

    const newReviewTypeExist = allReviewTypes.find((reviewType) =>
      reviewType.c_name === newReviewTypeName &&
      reviewType.c_required_signature === newReviewTypeRequiredSignature &&
      this.checkIfRolesAreEqual(reviewType.c_roles, newReviewTypeRoles)
    )

    if (newReviewTypeExist) {
      faults.throw('axon.invalidArgument.repeatedRolesRestriction')
    }
  }

  @log({ traceError: true })
  @trigger('update.before', { object: 'c_review_type', weight: 1, inline: true })
  static validateReviewTypeBeforeUpdate() {
    const modifiedReviewTypeId = script.arguments.new._id
    const modifiedReviewTypeName = script.arguments.new.c_name || script.arguments.old.c_name
    const modifiedReviewTypeRequiredSignature = script.arguments.new.c_required_signature || script.arguments.old.c_required_signature
    const modifiedReviewTypeRoles = script.arguments.new.c_roles || script.arguments.old.c_roles

    const allReviewTypes = c_review_type.find()
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()

    const updatedReviewTypeExists = allReviewTypes.find((reviewType) =>
      reviewType._id.toString() !== modifiedReviewTypeId.toString() &&
      reviewType.c_name === modifiedReviewTypeName &&
      reviewType.c_required_signature === modifiedReviewTypeRequiredSignature &&
      this.checkIfRolesAreEqual(reviewType.c_roles, modifiedReviewTypeRoles)
    )

    if (updatedReviewTypeExists) {
      faults.throw('axon.invalidArgument.repeatedRolesRestriction')
    }
  }

}

module.exports = ValidateReviewType