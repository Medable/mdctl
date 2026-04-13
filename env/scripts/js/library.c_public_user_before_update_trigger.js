import { trigger, log } from 'decorators'
import faults from 'c_fault_lib'

const { c_public_users } = org.objects

class PublicUserBeforeUpdate {

  static validatePublicUserEmailBeforeUpdate(publicUserId) {
    return script.as(script.principal._id, { safe: false, principal: { skipAcl: true, grant: 'script' } }, () => {
      const participant = c_public_users.find({ _id: publicUserId })
        .next()
      if (participant.c_account) {
        // User has already registered
        faults.throw('axon.invalidArgument.accountExistsForEmail')
      }
    })
  }

  static validatePublicUserUsernameBeforeUpdate(publicUserId) {
    return script.as(script.principal._id, { safe: false, principal: { skipAcl: true, grant: 'script' } }, () => {
      const participant = c_public_users.find({ _id: publicUserId })
        .next()
      if (participant.c_account) {
        // User has already registered
        faults.throw('axon.invalidArgument.accountExistsForUsername')
      }
    })
  }

  @log({ traceError: true })
  @trigger('update.before', {
    object: 'c_public_user',
    weight: 1,
    if: {
      $or: [
        {
          $gte: [{
            $indexOfArray: [
              '$$SCRIPT.arguments.modified',
              'c_email'
            ]
          }, 0]
        },
        {
          $gte: [{
            $indexOfArray: [
              '$$SCRIPT.arguments.modified',
              'c_username'
            ]
          }, 0]
        }
      ]
    }
  })
  static participantBeforeUpdate() {
    const oldEmail = script.arguments.old.c_email
    const newEmail = script.arguments.new.c_email
    const oldUsername = script.arguments.old.c_username
    const newUsername = script.arguments.new.c_username

    // Check if email is changing (handles null/undefined cases)
    if (newEmail !== oldEmail) {
      this.validatePublicUserEmailBeforeUpdate(script.arguments.old._id)
    }
    // Check if username is changing (handles null/undefined cases)
    if (newUsername !== oldUsername) {
      this.validatePublicUserUsernameBeforeUpdate(script.arguments.old._id)
    }
  }

}