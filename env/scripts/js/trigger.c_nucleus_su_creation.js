/***********************************************************

@script     Nucleus - Site User Creation Trigger

@brief      Create the new site users connection to the site

@author     Fiachra Matthews

@version    1.0.0

(c)2018-2014 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import connections from 'connections'
import { roles } from 'consts'
import faults from 'c_fault_lib'
import { id } from 'util'
import logger from 'logger'

const { c_account: { _id: targetId }, c_site: { _id: contextId }, c_role: role } = script.context,
      roleID = roles[role],
      targets = [{
        _id: targetId,
        roles: [roleID],
        auto: true
      }]

if (!roleID) faults.throw('axon.invalidArgument.roleDoesNotExist')

const apps = org.objects.org.find()
        .paths('apps')
        .skipAcl()
        .grant(4)
        .next().apps,
      sessionApps = apps.filter(app => app.clients[0].sessions && app.clients[0].enabled),
      // eslint-disable-next-line no-mixed-operators
      appKey = sessionApps.length && sessionApps[0].clients[0].key || ''

return connections.create('c_sites', contextId, targets, { skipAcl: true, grant: 6, forceAuto: true, skipNotification: true, forceAllowConnections: true, connectionAppKey: appKey })