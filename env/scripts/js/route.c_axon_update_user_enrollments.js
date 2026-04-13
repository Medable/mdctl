/***********************************************************

@script     Axon - Update User Enrollments

@brief      Update a user's enrollments

@body
    account: ID of account that needs to be updated
    c_group: new participation group _id that user needs to be enrolled into

@author     Matt Lean     (Medable.MIL)

@version    4.2.0         (Medable.MIL)

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

var moment = require('moment'),
    objects = require('objects'),
    request = require('request');

var account = objects.read('accounts', request.body.account, {paths: ['_id', 'email', 'c_enrollments', 'c_study_groups'], grant: 7});
var c_group = request.body.c_group;
var group = objects.read('c_groups', c_group, {expand: 'c_study'});
var c_study = group.c_study;
var groups = objects.list('c_groups', {where: {c_study: c_study._id}, limit: 1000});

// Check to see if the account is enrolled into a group for this study already
var acctStudyGroupIndex = -1;

for(var i=0; i < groups.data.length; ++i) {
    var currGroup = String(groups.data[i]._id);

    for(var j=0; j < account.c_study_groups.length; ++j) {
        var currAcctStudyGroup = String(account.c_study_groups[j]);

        if(currGroup === currAcctStudyGroup) {
            acctStudyGroupIndex = j;
            break;
        }
    }
}

var currTime = moment().utc().format();
var oldEnrollment = null;

// Enroll the Medable account into the group
if(acctStudyGroupIndex > -1) {
    var studyGroupId = account.c_study_groups.splice(acctStudyGroupIndex, 1); // Remove old group from c_study_groups

    // Log the unenrollment in the enrollment history
    for(var k=(account.c_enrollments.length - 1); k >= 0; --k) {
        var currEnrollment = account.c_enrollments[k];
   
        if(!currEnrollment.left && (String(currEnrollment.c_group._id) === String(studyGroupId))) {
            oldEnrollment = currEnrollment;
            break;
        }
    }
}

// Add new group into c_study_groups
account.c_study_groups.push(c_group);

// Log enrollment in the enrollment history
var newEnrollment = {
    c_group: c_group,
    c_joined: currTime
};
        
var patchOps = [{
    op: 'push',
    path: 'c_enrollments',
    value: newEnrollment
}, {
    op: 'set',
    path: 'c_study_groups',
    value: account.c_study_groups
}];
        
if(oldEnrollment) {
    patchOps.push({
        op: 'set',
        path: 'c_enrollments.' + oldEnrollment._id + '.c_left',
        value: currTime
    });
}

account = objects.patch('accounts', account._id, patchOps, {grant: 7, skipAcl: true});

var publicUsers = objects.list('c_public_users', {where: {'$and': [{'c_study': c_study._id}, {'c_email': account.email}]}, paths: ['_id'], sort: {created: -1}, grant: 7, skipAcl: true}).data;

if(publicUsers.length > 0) {
    objects.update('c_public_users', publicUsers[0]._id, {c_group: c_group});
}

return {
    '_id': account._id,
    'email': account.email,
    'name': account.name,
    'c_enrollments': account.c_enrollments,
    'c_study_groups': account.c_study_groups
};