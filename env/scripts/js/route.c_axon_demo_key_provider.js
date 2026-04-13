/***********************************************************

@script     Axon - Demo Key Provider

@brief      Route for anonymously returning demo app api key

@query      (Optional) siteapp=true: return the key for siteapp

@author     James Sas     (Medable.JMS)

@version    4.2.0         (Medable.JMS)

(c)2016-2017 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import request from 'request'

let { siteapp } = request.query
let returnKey = request.client.key

if (siteapp) {
  let appList = org.objects.org.find()
    .skipAcl()
    .grant(consts.accessLevels.read)
    .paths('apps')
    .next().apps
  let app = appList.find(v => v.name === 'c_site_app_demo')

  returnKey = (app && app.clients[0] && app.clients[0].key) || returnKey
}

return returnKey