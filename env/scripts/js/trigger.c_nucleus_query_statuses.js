import { roles } from 'consts'
import { QueryType, QueryStatus } from 'c_nucleus_query'
import { debug } from 'logger'
import faults from 'c_fault_lib'

// eslint-disable-next-line eqeqeq
const hasRole = (rlist, role) => rlist.find(x => x == `${roles[role]}`),
      {
        old: {
          accessRoles: ctxRoles,
          c_status: oldStatus,
          c_type: qType
        },
        new: {
          c_status: newStatus,
          c_search
        }
      } = script.arguments,
      isDM = hasRole(ctxRoles, 'Data Manager'),
      isSM = hasRole(ctxRoles, 'Site Monitor'),
      isAxonSM = hasRole(ctxRoles, 'Axon Site Monitor'),
      isPDM = hasRole(ctxRoles, 'Principal Data Manager'),
      isSU = hasRole(ctxRoles, 'Site User'),
      isAxonSU = hasRole(ctxRoles, 'Axon Site User'),
      isAdmin = hasRole(ctxRoles, 'Administrator')

if (newStatus === QueryStatus.ClosedRequery && oldStatus !== QueryStatus.Responded) {
  faults.throw('axon.invalidArgument.queryStatusToClosedRequery')
}


if (!isDM && !(isSM || isAxonSM) && !isPDM && !(isSU || isAxonSU) && !isAdmin) {
  throw Fault.create({ errCode: 'cortex.accessDenied.instanceUpdate' })
}

// SU covers SU and SI
if (isSU || isAxonSU) {

  const keys = Object
    .keys(script.arguments.new)
    .filter(v => v.startsWith('c_'))

  if (keys.length > 1 || keys[0] !== 'c_response') {

    throw Fault.create({ errCode: 'cortex.accessDenied.instanceUpdate' })
  }
}

// Update flag for manual closing of queries. QEV needs this info.
if ((isDM || isSM || isAxonSM || isPDM || isAdmin) && newStatus !== oldStatus) {

  if (newStatus === QueryStatus.Closed || newStatus === QueryStatus.ClosedRequery) {

    script.arguments.new.update('c_manually_closed', true, { grant: consts.accessLevels.update })

    script.arguments.new.update('c_closed_by', script.principal._id, { grant: consts.accessLevels.update })

    const closedDateTime = new Date()
      .toISOString()

    script.arguments.new.update('c_closed_datetime', closedDateTime, { grant: consts.accessLevels.update })
  }
}

// Editing something other than status
if (!isAdmin && !newStatus && !c_search && qType === QueryType.System) {
  faults.throw('axon.accessDenied.cannotEditQueryMessages')
}

return true