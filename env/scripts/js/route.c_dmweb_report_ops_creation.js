import logger from 'logger'
import request from 'request'
import faults from 'c_fault_lib'
import { createReportOperation, isNewSiteUser } from 'c_dmweb_reports_generator'
import nucUtils from 'c_nucleus_utils'


const _id = request.body.reportId
const reportCursor = org.objects.c_dmweb_reports.find({ _id })

if (!reportCursor.hasNext()) {
  throw Fault.create('kNotFound')
}

const report = reportCursor.next()

if (report.c_config && report.c_config.c_roles && report.c_config.c_roles.length > 0) {
  let study = {}, site = {}

  const studyCursor = org.objects.c_study.find()
    .paths('_id')
    .limit(1)

  if (!studyCursor.hasNext()) {
    // this case is nearly impossible b eacuse studies are a pre-condition for almost everything
    throw Fault.create('kAccessDenied')
  }

  study = studyCursor.next()

  if (!isNewSiteUser(script.principal.roles)) {
    const siteCursor = org.objects.c_sites.find()
      .paths('_id')
      .limit(1)

    if (siteCursor.hasNext()) {
      site = siteCursor.next()
    }
  } else {
    const siteCursor = org.objects.accounts
      .find()
      .pathPrefix(`${script.principal._id}/c_sites`)
      .paths(['_id'])
      .limit(1)
    if (siteCursor.hasNext()) {
      site = siteCursor.next()
    }
  }

  const { getUserRolesSimple } = require('c_nucleus_utils')

  const userRoles = getUserRolesSimple(script.principal._id, site._id, study._id)

  if (userRoles.length === 0) {

    throw Fault.create('kAccessDenied')
  }

  const { id: { isIdFormat } } = require('util')

  const reportAllowedRoles = report
    .c_config
    .c_roles.map(v => isIdFormat(v) ? v.toString() : consts.roles[v]).filter(Boolean).map(v=>v.toString())

  const isAllowed = userRoles.map(v => v.toString())
    .some(r => reportAllowedRoles.includes(r))

  if (!isAllowed) {
    throw Fault.create('kAccessDenied')
  }

}
return createReportOperation(report)