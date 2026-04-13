/***********************************************************

@script     Axon - Validate Org Pin

@brief      Checks if the input pin matches the organization's
            pin

@author     Matt Lean     (Medable.MIL)

@version    4.2.0         (Medable.MIL)

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import faults from 'c_fault_lib'

var objects = require('objects'),
    request = require('request')

let org = objects.read('orgs', script.org._id, { paths: ['c_pin'], grant: 7, skipAcl: true })

if (org.c_pin === parseInt(request.body.pin)) {
  script.exit(true)
}

faults.throw('axon.invalidArgument.orgPinInvalid')