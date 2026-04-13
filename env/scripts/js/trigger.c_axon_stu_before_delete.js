/***********************************************************

@script     Axon - Study Team User Before Delete Trigger

@brief      Delete study team user's associated connection

@author     Matt Lean     (Medable.MIL)

@version    4.2.0         (Medable.MIL)

(c)2016-2018 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import connections from 'connections';

const { c_study_team_user: studyTeamUser } = org.objects;

const studyTeamUserSearch = studyTeamUser.find({
    _id: script.arguments.old._id,
}).paths('c_account', 'c_study').limit(1).toList().data;

if(studyTeamUserSearch.length > 0) {
    const oldStudyTeamUser = studyTeamUserSearch[0];

    const connectionSearch = connections.list({
        where: {
            context: oldStudyTeamUser.c_study._id,
        },
        paths: ['context', 'target'],
        skipAcl: true
    }).data;
    
    for(let i=0; i < connectionSearch.length; ++i) {
        const currConnection = connectionSearch[i];
        
        if(currConnection.target.account._id.toString() === oldStudyTeamUser.c_account._id.toString()) {
            connections.delete(currConnection._id, { skipAcl: true });
            return;
        }
    }
}