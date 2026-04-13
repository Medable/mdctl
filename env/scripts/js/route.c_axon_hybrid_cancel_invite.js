import NucleusUtils from 'c_nucleus_utils'
import moment from 'moment'
import request from 'request'
import faults from 'c_fault_lib'
import { isIdFormat } from 'util.id'

const { c_public_user, c_site, c_study } = request.body,
      { c_public_users } = org.objects,
      allowedRoles = ['Administrator', 'Developer', 'Site User', 'Site Investigator', 'Axon Site User', 'Axon Site Investigator'],
      // get the users roles
      roles = NucleusUtils.getUserRolesSimple(script.principal._id, c_site)
        .map(v => v.toString()),
      // get the ids of the allowed roles
      aRoleIds = allowedRoles.map(v => consts.roles[v].toString()),
      // check if the user roles are in the granted roles
      granted = aRoleIds.some(r => roles.indexOf(r) >= 0)

if (!granted) {
  faults.throw('axon.accessDenied.routeAccessDenied')
}

if (!isIdFormat(c_public_user)) {
  faults.throw('axon.invalidArgument.validSubjectRequired')
}

let pu = c_public_users.readOne({ _id: c_public_user })
  .skipAcl()
  .grant(consts.accessLevels.read)
  .throwNotFound(false)
  .execute()

if (!pu.c_invite) {
  faults.throw('axon.invalidArgument.subjectNotValidInvite')
}

// set the right status on the public user
if (pu && pu.c_invite && pu.c_invite !== 'expired') {
  pu = c_public_users.updateOne({ _id: pu._id }, { $set: { c_invite: 'expired' } })
    .skipAcl()
    .grant(consts.accessLevels.update)
    .lean(false)
    .execute()
}

return pu