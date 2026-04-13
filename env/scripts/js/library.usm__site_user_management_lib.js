import { route } from 'decorators'
import faults from 'c_fault_lib'
import { UtilsLibrary } from 'usm__utils_lib'

const isNewPermissionModel = UtilsLibrary.isNewPermissionModel()

export class SiteUserManagementLibrary {

  @route({
    method: 'PUT',
    name: 'usm__unassign_site',
    path: 'usm/sites/:siteId/users/:accountId',
    acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
  })
  static unassignSite({ req }) {
    const { params: { siteId, accountId } } = req
    const siteExists = org.objects.c_site.find({ _id: siteId })
      .skipAcl()
      .grant('read')
      .hasNext()
    if (!siteExists) {
      faults.throw('usm.notFound.site')
    }
    const user = org.objects.account.readOne({ _id: accountId })
      .throwNotFound(false)
      .skipAcl()
      .grant('read')
      .paths('c_site_access_list')
      .passive()
      .execute()

    if (!user) {
      org.objects.c_site_users.deleteOne({ _id: accountId, c_site: siteId })
        .skipAcl()
        .grant('delete')
        .execute()
    }

    if (user && user.c_site_access_list && user.c_site_access_list.length) {
      org.objects.account.updateOne({ _id: user._id }, { $pull: { c_site_access_list: siteId } })
        .skipAcl()
        .grant('script')
        .execute()
    }
    if (user && !isNewPermissionModel) {
      org.objects.c_site_users.deleteMany({ c_site: siteId, c_account: user._id })
        .skipAcl()
        .grant('delete')
        .execute()
    }

    return {
      status: 'done'
    }
  }

  @route({
    method: 'GET',
    name: 'usm__site_details',
    path: 'usm/sites/:siteId',
    acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
  })
  static getSiteDetails({ req }) {
    const { params: { siteId } } = req
    if (!siteId) {
      faults.throw('usm.notFound.site')
    }
    const site = org.objects.c_site.readOne({ _id: siteId })
      .throwNotFound(false)
      .skipAcl()
      .grant('read')
      .execute()

    if (!site) {
      faults.throw('usm.notFound.site')
    }
    return site
  }

  @route({
    method: 'GET',
    name: 'usm__site_schema',
    path: 'usm/sites_schema',
    acl: ['role.administrator', 'role.support', 'role.usm__user_and_site_manager']
  })
  static getSiteSchema() {
    const siteSchema = org.objects.object.find({ name: 'c_site' })
      .skipAcl()
      .grant('read')
      .next()
    return siteSchema
  }

}