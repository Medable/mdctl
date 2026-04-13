/***********************************************************

@script     Nucleus - Query Numbering

@brief      Trigger to auto number the queries after creation

@author     Fiachra Matthews

@version    1.0.0

(c)2018-2014 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/
import { roles } from 'consts'
import { QueryType } from 'c_nucleus_query'
import logger from 'logger'
import nucUtils from 'c_nucleus_utils'
import faults from 'c_fault_lib'

// System Queries can only be created by admins

// eslint-disable-next-line eqeqeq
const hasRole = (rlist, role) => rlist.find(x => x == `${roles[role]}`),
      {
        accessRoles: ctxRoles,
        c_type: qType

      } = script.context,
      isAdmin = hasRole(ctxRoles, 'Administrator')

// eslint-disable-next-line eqeqeq
if (qType == QueryType.System && !isAdmin) {
  faults.throw('axon.accessDenied.systemQueriesAdminsOnly')
}

// Query Search Terms

try {
  const search = nucUtils.updateQuerySearchTerms(script.context)

  if (search.length > 0) { script.context.update('c_search', search, { grant: 6 }) }
} catch (e) {}

// Query Numbering

// eslint-disable-next-line eqeqeq
if (!script.arguments.new.hasOwnProperty('c_number') || script.arguments.new.c_number == '') {

  const study = org.objects.c_studies.find({ _id: script.arguments.new.c_study._id }).skipAcl().grant(consts.accessLevels.read).next()
  if (study) {
    const autoNum = nucUtils.getNextQueryID(study)
    script.arguments.new.update('c_number', autoNum, { grant: 6 })
  }

}