/***********************************************************

@script     Axon - Hybrid - List Invites

@brief      Route to return list the invites

@parameters
    c_site: the site to list the invites from (either this or c_study is required)
    c_study: the study to list all invites from (either this or c_site is required)
    limit: number of records to return, default 10, max 30
    skip: number of records to skip, default 0

@version    4.5.0

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/
import faults from 'c_fault_lib'
import NucleusUtils from 'c_nucleus_utils'
import { query } from 'request'
import moment from 'moment'

const { c_public_users, c_sites } = org.objects,
      { c_site, c_search, sort } = query,
      allowedRoles = ['Administrator', 'Developer', 'Site User', 'Site Investigator', 'Axon Site User', 'Axon Site Investigator'],
      // get the users roles
      roles = NucleusUtils.getUserRolesSimple(script.principal._id, c_site)
        .map(v => v.toString()),
      // get the ids of the allowed roles
      aRoleIds = allowedRoles.map(v => consts.roles[v].toString()),
      // check if the user roles are in the granted roles
      granted = aRoleIds.some(r => roles.indexOf(r) >= 0),
      defaultLimit = 10, maxLimit = 30, deafultSkip = 0

if (!granted) {
  faults.throw('axon.accessDenied.routeAccessDenied')
}

let { limit, skip } = query

limit = limit || defaultLimit
skip = skip || deafultSkip

if (limit > maxLimit) {
  faults.throw('axon.invalidArgument.inviteListLimitTooHigh')
}

const searchQuery = { c_invite: { $in: ['invited', 'expired', 'rejected', 'accepted', null] }, c_email: { $gt: '' }, c_state: { $in: ['authorized', 'unauthorized', null] } }

if (c_search) {
  searchQuery.c_email = { $regex: `/^${RegExp.escape(c_search.toLowerCase())}/` }
}

if (c_site) {
  // set query to check on the site
  if (c_sites.find({ _id: c_site })
    .skipAcl()
    .grant(consts.accessLevels.read)
    .hasNext()) {
    searchQuery.c_site = c_site
  } else {
    faults.throw('axon.invalidArgument.validSiteRequired')
  }

}

const now = moment()

return c_public_users.find(searchQuery)
  .sort(sort)
  .include('c_invite', 'c_email')
  .skipAcl()
  .grant(consts.accessLevels.read)
  .skip(skip)
  .limit(limit)
  .transform({ script: 'c_invite_expiry_transform' })