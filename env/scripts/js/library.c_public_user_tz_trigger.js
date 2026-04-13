import { trigger, log } from 'decorators'
const { c_sites, c_public_users } = org.objects

class PublicUserTimzoneLibrary {

  @log({ traceError: true })
  @trigger('create.after', { object: 'c_public_user', weight: 5, inline: true })
  static addUserTimezoneIfNotExists({ new: publicUser }) {
    if (!publicUser.c_tz) {
      let tz

      if (publicUser.c_site) {
        const site = c_sites.find({ _id: publicUser.c_site._id })
          .skipAcl()
          .grant(consts.accessLevels.read)
          .next()

        tz = site.c_tz
        if (!tz) {
          const siteUser = org.objects.account.find({ _id: script.principal._id })
            .paths('tz')
          if(siteUser.hasNext()) { 
            const userData = siteUser.next()
            tz = userData.tz
          }
        }

      }
      tz = tz || 'UTC'
      c_public_users.updateOne({ _id: publicUser._id }, { $set: { c_tz: tz } })
        .skipAcl()
        .grant(consts.accessLevels.update)
        .execute()
    }
  }

}