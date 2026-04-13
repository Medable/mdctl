/***********************************************************

@script     Axon - Get User Group Enrollments

@brief		Get study groups by account _id

@query
    accountid: user account _id

@author     Matt Lean     (Medable.MIL)

@version    4.2.0         (Medable.MIL)

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

var objects = require('objects'),
    request = require('request');

var accountId = request.query.accountid;

var account = objects.read('accounts', accountId, {grant: 7, skipAcl: true});

return {
    _id: account._id,
    email: account.email,
    name: account.name,
    c_study_groups: account.c_study_groups
};