/***********************************************************

@script     Nucleus - Site Numbering

@brief      Trigger to auto number the sites after creation

@author     Fiachra Matthews

@version    1.0.0

(c)2018-2014 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

/* eslint-disable */

// TRIGGER DISABLED IN AXON 4.14
// SHOULD BE REMOVED IN SUBSEQUENT RELEASES

import objects from 'objects';
import logger from 'logger';
import nucUtils from 'c_nucleus_utils';


if (!script.arguments.new.hasOwnProperty('c_number') || script.arguments.new.c_number == "") {
    
    const Studies = org.objects.c_studies;
    const study = Studies.find({ _id:script.arguments.new.c_study._id }).skipAcl().grant(consts.accessLevels.read).next();
    if(study)
    {
        const autoNum = nucUtils.getNextSiteID(study);
        script.arguments.new.update('c_number', autoNum);
    }
    
}