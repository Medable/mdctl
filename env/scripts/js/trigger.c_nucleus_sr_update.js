import logger from 'logger'
import nucUtils from 'c_nucleus_utils'

if (script.arguments.new.hasOwnProperty('c_value')) {

  let puid = script.arguments.old.c_public_user._id
  let publicUser = org.objects.c_public_user.find({ _id: puid }).skipAcl().grant(consts.accessLevels.read).next()

  if (publicUser.c_review_status === 'Approved') {
    script.as(nucUtils.SystemUser.name, {}, () => { return org.objects.c_public_user.updateOne({ _id: publicUser._id }, { '$set': { c_review_status: 'Review' } }).lean(false).execute() })
  }
}