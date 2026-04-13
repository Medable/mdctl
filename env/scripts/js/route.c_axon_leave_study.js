/***********************************************************

@script     Axon - Leave Study

@brief      Route to notify study management of participant
            leave request

@body
    account: Account ID of participant that wants to leave
    c_study: ID of the study that the account wants to leave

@author     Matt Lean     (Medable.MIL)

@version    4.2.0  (Medable.MIL)

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/
import faults from 'c_fault_lib'
import _ from 'lodash'
import { getSiteAppParticipantUrl } from 'c_axon_script_lib'

const notifications = require('notifications'),
      objects = require('objects'),
      request = require('request')

const axonScriptLib = require('c_axon_script_lib'),
      currentOrg = org.objects
        .orgs.find()
        .skipAcl()
        .grant('read')
        .paths('name')
        .next()

// The following line will only work if the account that is requesting to leave is doing the leave request, otherwise it will throw an error
let account
let study
let site
let groups
let publicUser

try {
  study = objects.read('c_studies', request.body.c_study, { paths: ['_id', 'c_code', 'c_name'], expand: ['c_groups'], grant: 7, skipAcl: true })
  groups = objects.list('c_groups', { where: { c_study: study._id }, grant: 7, skipAcl: true, limit: 1000 }).data
} catch (err) {
  faults.throw('axon.invalidArgument.validStudyRequired')
}

if (request.body.account) {
  try {
    const accountId = script.principal._id.toString()
    if (request.body.account !== accountId) faults.throw('axon.invalidArgument.validAccountRequired')
    account = objects.read('accounts', request.body.account, { paths: ['_id', 'name', 'email', 'c_study_groups'], grant: 7, skipAcl: true })
    publicUser = objects.list('c_public_users', { where: { c_account: account._id }, grant: 7, skipAcl: true }).data[0]
  } catch (err) {
    faults.throw('axon.invalidArgument.validAccountRequired')
  }

  if (!publicUser) {
    faults.throw('axon.invalidArgument.validSubjectRequired')
  }
} else if (request.body.c_public_user) {
  try {
    publicUser = objects.read('c_public_users', request.body.c_public_user, { grant: 7, skipAcl: true })
  } catch (err) {
    faults.throw('axon.invalidArgument.validSubjectRequired')
  }
} else {
  faults.throw('axon.invalidArgument.accountOrSubjectRequired')
}

if (account) {
  let enrolled = false

  for (const i in account.c_study_groups) {
    for (const j in groups) {
      if (String(account.c_study_groups[i]) === String(groups[j]._id)) {
        enrolled = true
        break
      }
    }

    if (enrolled) {
      break
    }
  }

  if (!enrolled) {
    faults.throw('axon.invalidArgument.accountNotEnrolled')
  }

  site = script.as('c_system_user', { safe: false, principal: { skipAcl: true, grant: consts.accessLevels.read } }, () => {
    return org.objects.c_site.find({ _id: publicUser.c_site._id })
      .paths(['c_site_account_list'])
      .expand(['c_site_users.c_account'])
      .next()
  })

  // get Site Users & Site Investigators accounts
  const mgmtRoles = ['Site User', 'Axon Site Investigator']
  const mgmtAccounts = site.c_site_users.data
    .filter(({ c_role }) => _.includes(mgmtRoles, c_role))
    .map(({ c_account }) => c_account)

  // get Axon Site Users & Axon Site Investigators accounts
  const newMgmtRoles = [
    consts.roles['Axon Site User'].toString(),
    consts.roles['Axon Site Investigator'].toString()
  ]
  const newSiteMgmtAccounts = site.c_site_account_list.data
    .filter(({ roles }) => _.intersection(newMgmtRoles, roles.map(x => x.toString())).length > 0)

  // send notifications
  const siteMgmt = [...mgmtAccounts, ...newSiteMgmtAccounts]
  siteMgmt.forEach(account => {
    notifications.send('c_axon_leave_study_mgmt', {
      study_name: study.c_name,
      participant_id: publicUser.c_number || publicUser._id,
      participant_url: getSiteAppParticipantUrl(publicUser._id)
    }, {
      recipient: account.email,
      locale: account.locale
    })
  })

  axonScriptLib.track('dropout_requests', request.body.c_study)
  return 'The study management team has been notified that participant ' + account._id + ' has requested to leave the study ' + study._id + '.'
} else {
  publicUser = objects.update('c_public_users', publicUser._id, { c_state: 'left' }, { grant: 7, skipAcl: true })

  return 'Public user ' + publicUser._id + ' has left the study.'
}