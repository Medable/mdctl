/***********************************************************

@script     Nucleus - Nucleus - Automatic Query Management

@brief      Fires System Query Evaluation and handles task response
            inactivation

@author     Nicolas Ricci

@version    1.0.0

(c)2018-2014 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import logger from 'logger'
import { checkQueries, QueryStatus } from 'c_nucleus_query'
import _ from 'underscore'

if (script.context.c_completed && (
// Restrict QEV actuation to only changes in the actual content of the response
  _.contains(script.arguments.modified, 'c_completed') ||
    _.contains(script.arguments.modified, 'c_step_responses'))) {
  console.log('check')
  const tr = Object.assign({}, script.arguments.old)
  Object.assign(tr, script.arguments.new)
  checkQueries(tr)
}