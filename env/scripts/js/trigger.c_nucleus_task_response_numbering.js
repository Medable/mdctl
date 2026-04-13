/***********************************************************

@script     Nucleus - Task Response Numbering

@brief      Trigger to auto number task responses

@author     Fiachra Matthews

@version    1.0.0

(c)2018-2014 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/
import logger from 'logger'
import nucUtils from 'c_nucleus_utils'

const Studies = org.objects.c_studies

const study = Studies.find({ _id: script.arguments.new.c_study._id })
  .skipAcl()
  .grant(consts.accessLevels.read)
  .next()

if (study) {
  const autoNum = nucUtils.getNextTaskRespID(study)
  script.arguments.new.update('c_number', autoNum)
}