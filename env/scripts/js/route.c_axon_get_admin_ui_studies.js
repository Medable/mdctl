/***********************************************************

@script     Axon - Get Admin UI Studies

@brief      Retrieve relevant studies for the account in
            web admin UI

@version    4.3.2

(c)2016-2019 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import { id } from 'util'

const { c_studies: study, c_study_team_user: studyTeamUser } = org.objects,
      callerRoles = script.principal.roles

if (id.inIdArray(callerRoles, consts.roles.admin) || id.inIdArray(callerRoles, consts.roles.developer)) {
  return study.find().paths('c_name', 'c_code', 'c_field', 'c_start_date', 'c_end_date', 'created').passthru()
}

const studyList = studyTeamUser.find({ c_account: script.principal._id }).map(u => u.c_study._id)

return study
  .find({ $or: [{ _id: { $in: studyList } }, { owner: script.principal._id }] })
  .paths('c_name', 'c_code', 'c_field', 'c_start_date', 'c_end_date', 'created')
  .passthru()