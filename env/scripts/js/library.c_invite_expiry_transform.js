import moment from 'moment'
import logger from 'logger'
import c_nuc_utils from 'c_nucleus_utils'

const { transform } = require('decorators-transform')
const { c_public_users } = org.objects

// We transform the public users is they invite is expired.
@transform
class InviteExpiryTransform {

  beforeAll(memo) {
    memo.earliestInvite = moment(c_nuc_utils.getInviteExpiredBeforeTime())
  }

  each(c_public_user, memo) {

    if (c_public_user.c_invite === 'invited' && memo.earliestInvite.isAfter(c_public_user.c_last_invite_time)) {
      // just set the current object c_invite to expired instead of returning the updated result
      c_public_user.c_invite = 'expired'
      c_public_users.updateOne({ _id: c_public_user._id }, { $set: { c_invite: 'expired' } })
        .skipAcl()
        .grant(consts.accessLevels.update)
        .execute()
    }

    return c_public_user
  }

}

module.exports = InviteExpiryTransform