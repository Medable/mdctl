/***********************************************************

@script     Axon - Update Form Step Orders

@brief		Route to re-order form steps after sorting
            modification

@body
    stepOrders: ordered array of steps
    stepid: form parent step _id

@author     Matt Lean     (Medable.MIL)

@version    4.2.0         (Medable.MIL)

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

var objects = require('objects'),
    request = require('request');

var steps = request.body.stepOrders;
var stepid = request.body.stepid;

for(var i=0; i < steps.length; ++i) {
    var currStep = steps[i];

    if(currStep.count !== '') {
        objects.update('c_steps', currStep.id, {
            c_order: currStep.count
        });
    }
}

return objects.list('c_steps', {where: {c_parent_step: stepid}, limit: steps.length}).data;