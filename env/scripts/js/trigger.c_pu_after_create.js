/***********************************************************

@script     PU After Create: Trigger

@brief      Public User After create: Set search terms

@author     Fiachra Matthews

@version    4.9.0

(c)2016-2019 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import c_nuc_utils from 'c_nucleus_utils'

c_nuc_utils.setPublicuserSearchTerms(script.arguments.new._id)
c_nuc_utils.setPublicuserNameEmail(script.arguments.new._id)