/***********************************************************

@script     Nucleus - Site User Deletion Trigger

@brief      Removing the users connection to the site

@author     Fiachra Matthews

@version    1.0.0

(c)2016-2018 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import connections from 'connections'

const { c_site_users: siteUsers } = org.objects,
      siteUser = siteUsers.find({ _id: script.arguments.old._id })
        .paths('c_account', 'c_site')
        .next()

if (siteUser) {

  const generateContextIds = () => {
    const contextIds = [siteUser.c_site._id]
    return { $in: contextIds }
  }

  let options = {
    where: {
      'context._id': generateContextIds(),
      'target.account._id': siteUser.c_account._id
    },
    skipAcl: true
  }

  const cons = connections.list(options).data

  cons.forEach(({ _id }) => {
    connections.delete(_id, { skipAcl: true })
  })

}