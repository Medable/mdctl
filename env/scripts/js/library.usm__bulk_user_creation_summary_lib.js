import { route } from 'decorators'
import { getRoleToNameMapping } from 'usm__utils_lib'
const orgRoleMap = getRoleToNameMapping()
import logger from 'logger'
export class BulkSummaryLibrary {

    @route({
      method: 'GET',
      name: 'usm__bulk_user_creation_summary',
      path: 'usm/bulk_summary',
      acl: ['account.anonymous']
    })
  static getSummary() {
    let emails = []

    const [recentUserBulkRequest] = org.objects.usm__bulk_request.find({ 'creator._id': script.principal._id })
      .sort({ created: -1 })
      .limit(1)
      .skipAcl()
      .grant('read')
      .paths('usm__batches','created')
      .toArray()
    if (!recentUserBulkRequest) {
      return {}
    }
    if (recentUserBulkRequest.usm__batches.some(batch => batch.usm__status === 'pending')) {
      return {}
    }
    for (const batch of recentUserBulkRequest.usm__batches) {
      if (batch.usm__status === 'successful') {
        emails.push(...batch.usm__items)
      }
    }
    emails = emails.map(data=>data.usm__email)
    if (!emails.length) {
      return {}
    }

    const rolesAssigned = recentUserBulkRequest.usm__batches[0].usm__items[0].usm__roles.map(role => orgRoleMap[role])
    let sitesAssigned
 
    if (recentUserBulkRequest.usm__batches[0].usm__items[0].usm__sites) {
      sitesAssigned = org.objects.c_sites.find({ _id: { $in: recentUserBulkRequest.usm__batches[0].usm__items[0].usm__sites } })
        .skipAcl()
        .grant('read')
        .toArray()
        .map(site => `${site.c_number} ${site.c_name}`)
    }
    const timestamp = recentUserBulkRequest.created
    return { emails, rolesAssigned, sitesAssigned, timestamp }
  }

}