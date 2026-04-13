/***********************************************************

@script     Axon - Get Participant Data

@brief      Retrieve participant data

@version    4.2.0

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import request from 'request';

const c_study = request.query.c_study;

const groups = org.objects.c_group.find({c_study: c_study}).paths('_id').map(g => g._id);

const accounts = org.objects.accounts.aggregate().match({
        c_study_groups: {$in: groups}
    })
    .project({gender: 1, age: 1})
    .skipAcl().grant(4).limit(1000).toList();

let participantData = {
    ages: {},
    genders: {
        f: 0,
        m: 0,
        u: 0
    },
    participants: 0
};

for(let i=0; i < accounts.data.length; ++i) {
    let currAccount = accounts.data[i];
    
    if(currAccount.gender === 'm') {
        ++participantData.genders.m;
    } else if(currAccount.gender === 'f') {
        ++participantData.genders.f;
    } else {
        ++participantData.genders.u;
    }
    
    if(participantData.ages[currAccount.age]) {
        ++participantData.ages[currAccount.age];
    } else {
        participantData.ages[currAccount.age] = 1;
    }
    ++participantData.participants;
}

return participantData;


// import moment from 'moment';
// import request from 'request';
// import logger from 'logger';

// const c_study = request.query.c_study;

// const c_groups = org.objects.c_group.find({c_study: c_study}).paths('_id').limit(1000).toList();

// let groupIds = [];
// for(let i=0; i < c_groups.data.length; ++i) {
//     groupIds.push(c_groups.data[i]._id);
// }

// const accounts = org.objects.accounts.find({
//     c_study_groups: {$in: groupIds}
// }).paths('age', 'gender').skipAcl().grant(4).limit(1000).toList();

// let participantData = {
//     ages: {},
//     genders: {
//         f: 0,
//         m: 0,
//         u: 0
//     },
//     participants: 0
// };

// moment()

// for(let i=0; i < accounts.data.length; ++i) {
//     let currAccount = accounts.data[i];
    
//     if(currAccount.gender === 'm') {
//         ++participantData.genders.m;
//     } else if(currAccount.gender === 'f') {
//         ++participantData.genders.f;
//     } else {
//         ++participantData.genders.u;
//     }
    
//     if(participantData.ages[currAccount.age]) {
//         ++participantData.ages[currAccount.age];
//     } else {
//         participantData.ages[currAccount.age] = 1;
//     }
//     ++participantData.participants;
// }

// return participantData;