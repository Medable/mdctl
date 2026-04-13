/***********************************************************

@script     Axon - Create Study Team User

@brief      Route for creating a study team user along with
            its corresponding connection

@author     Matt Lean     (Medable.MIL)

@version    4.3.2         (Medable.MIL)

(c)2016-2018 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/
import connections from 'connections'
import request from 'request'
import { genError } from 'c_axon_script_lib'
import faults from 'c_fault_lib'

const apps = org.objects.org.find().paths('apps').skipAcl().grant(4).next().apps,
      sessionApps = apps.filter(app => app.clients[0].sessions && app.clients[0].enabled),
      // eslint-disable-next-line no-mixed-operators
      appKey = sessionApps.length && sessionApps[0].clients[0].key || ''

if (!appKey) genError('No application key found')

const { account, c_study_team_user: studyTeamUser } = org.objects
const { email, role, c_study } = request.body

if (!email) faults.throw('axon.invalidArgument.validEmailRequired')
if (!role) faults.throw('axon.invalidArgument.validRoleRequired')
if (!c_study) faults.throw('axon.invalidArgument.validStudyRequired')

const userCheck = account.find({ email: request.body.email }).paths('email').grant(7).skipAcl().toList().data

if (userCheck.length < 1) faults.throw('axon.invalidArgument.noAccountForEmail')

const user = userCheck[0]

const studyTeamUserCheck = studyTeamUser.find({
  c_account: user._id,
  c_study: c_study
}).limit(1).toList()

if (studyTeamUserCheck && studyTeamUserCheck.data.length > 0) faults.throw('axon.invalidArgument.userAlreadyAssigned')

const roleID = consts.roles[role]

if (!roleID) faults.throw('axon.invalidArgument.roleDoesNotExist')

const newConnection = connections.create('c_studies', c_study, {
  _id: user._id,
  roles: [roleID],
  auto: true
}, {
  connectionAppKey: appKey,
  forceAuto: true,
  skipAcl: true
})

if (newConnection.name === 'error') {
  throw genError(newConnection.reason, newConnection.status)
}

const newStudyTeamUser = studyTeamUser.insertOne({
  c_account: user._id,
  c_role: request.body.role,
  c_study: request.body.c_study
}).lean(false).execute()

return {
  account: {
    _id: user._id,
    email: user.email
  },
  c_study_team_user: newStudyTeamUser,
  connection: newConnection
}