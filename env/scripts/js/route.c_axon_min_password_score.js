/***********************************************************

@script     Axon - Min Password Score

@brief      Route for returning min password score for use
            in authentication task

@author     James Sas     (Medable.JMS)

@version    4.2.0         (Medable.JMS)

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

return require('objects').read('orgs', script.org._id+'/configuration.minPasswordScore',  {skipAcl: true, grant: consts.accessLevels.read});