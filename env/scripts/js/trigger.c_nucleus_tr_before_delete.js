/***********************************************************

@script     Nucleus - Public User Before Delete (Permission Management)

@brief      Permission management

@author     Fiachra Matthews

@version    1.0.0

(c)2018-2014 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import faults from 'c_fault_lib'
import logger from 'logger'

const { c_task_response } = org.objects

let res = c_task_response
  .find({ _id: script.context._id })
  .expand('c_task')
  .paths('c_task.c_type')
  .skipAcl()
  .grant(consts.accessLevels.read)
  .next()

if (res.c_task && res.c_task.c_type.includes('consent')) {
  throw Fault.create({ errCode: 'cortex.accessDenied.instanceDelete' })
}