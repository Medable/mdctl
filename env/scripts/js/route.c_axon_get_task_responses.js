/***********************************************************

 @script     Axon - Get Task Responses

 @brief      Get the task responses for a public user

 @author     Tim Smith     (Medable.TRS)

 @version    4.2.2         (Medable.TRS)

 (c)2016-2018 Medable, Inc.  All Rights Reserved.
 Unauthorized use, modification, or reproduction is prohibited.
 This is a component of Axon, Medable's SmartStudy(TM) system.

 ***********************************************************/

import { query } from 'request'
import { list } from 'objects'
import { isIdFormat } from 'util.id'
import pathTo from 'util.paths.to'
import { pick } from 'underscore'
import faults from 'c_fault_lib'

const
      // ensure a known public user id is matched in the _first_ match stage
      match = query.pipeline ? JSON.parse(query.pipeline).find(s => !!s.$match) : JSON.parse(query.where),
      publicUserId = pathTo(match, 'c_public_user') || pathTo(match, '$match.c_public_user'),

      // ensure only non-privileged options are allowed from the client.
      allowedOptions = [
        'favorites', 'maxTimeMS', 'engine', 'explain', 'paths', 'include', 'expand', 'passive', 'locale', 'accessLevel',
        'startingAfter', 'endingBefore', 'skip', 'limit', 'where', 'map', 'sort', 'group', 'pipeline', 'prefix'
      ],
      listOptions = { ...pick(query, ...allowedOptions), skipAcl: true, grant: 4 }

if (!isIdFormat(publicUserId)) {
  faults.throw('axon.accessDenied.taskResponseAccessDenied')
}

script.exit(
  list('c_task_response', listOptions)
)