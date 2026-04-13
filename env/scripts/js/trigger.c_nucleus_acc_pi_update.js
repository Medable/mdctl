/***********************************************************

@script     Nucleus - Account Public Identifier Update

@brief      Trigger to update a public identifier depending on a cache entry

@author     Fiachra Matthews

@version    1.0.0

(c)2018-2014 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/
import nucUtils from 'c_nucleus_utils'
import cache from 'cache'
import connections from 'connections'

const data = cache.get('nucleus:publicIdentifierPattern')

if (data) {
  const Accounts = org.objects.accounts
  const account = Accounts.find({ _id: script.arguments.new._id })
    .skipAcl()
    .grant(consts.accessLevels.read)
    .limit(1)
    .paths(['name', 'c_public_identifier', 'roles'])
    .next()

  const conn = connections.list({ where: { roles: consts.roles.c_study_participant, 'target.account': account._id }, skipAcl: true, grant: 4, paths: ['target', 'context', 'roles'] })
  // eslint-disable-next-line
  if (account.roles.map(v => v.toString()).includes(consts.roles.c_study_participant.toString()) || conn.data.length > 0) {
    return
  }

  if (data.type === 'name') {
    const idString = nucUtils.getNameIDStringFromPattern(account, data.value, script.arguments.new.name)

    if (!account.c_public_identifier || account.c_public_identifier !== idString) {
      try {
        script.arguments.new.update('c_public_identifier', idString, { grant: 6 })
      } catch (e) {
        if (e.errCode !== 'cortex.notFound.propertySelection') {
          throw (e)
        }
      }

    }
  }
}