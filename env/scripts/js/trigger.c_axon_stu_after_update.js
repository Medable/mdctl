/***********************************************************

@script     Axon - Study Team User After Update Trigger

@brief      Update study team user's associated connection

@author     Matt Lean     (Medable.MIL)

@version    4.2.0         (Medable.MIL)

(c)2016-2018 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import connections from 'connections'
import faults from 'c_fault_lib'

const { c_study_team_user: studyTeamUser } = org.objects

const roleID = consts.roles[script.arguments.new.c_role]

if (!roleID) faults.throw('axon.invalidArgument.validRoleRequired')

const studyTeamUserSearch = studyTeamUser.find({
  _id: script.arguments.new._id
}).paths('c_account', 'c_study').limit(1).toList().data

if (studyTeamUserSearch.length > 0) {
  const currStudyTeamUser = studyTeamUserSearch[0]

  const connectionSearch = connections.list({
    where: {
      context: currStudyTeamUser.c_study._id
    },
    paths: ['context', 'target'],
    skipAcl: true
  }).data

  for (let i = 0; i < connectionSearch.length; ++i) {
    const currConnection = connectionSearch[i]

    if (currConnection.target.account._id.toString() === currStudyTeamUser.c_account._id.toString()) {
      connections.delete(currConnection._id, { skipAcl: true })
      break
    }
  }

  const newConnection = connections.create('c_studies', currStudyTeamUser.c_study._id, {
    _id: currStudyTeamUser.c_account._id,
    roles: [roleID],
    auto: true
  }, {
    forceAuto: true,
    skipAcl: true
  })
}