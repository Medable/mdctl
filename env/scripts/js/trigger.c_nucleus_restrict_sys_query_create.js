import { roles } from 'consts'
import { QueryType } from 'c_nucleus_query'
import faults from 'c_fault_lib'

// eslint-disable-next-line eqeqeq
const hasRole = (rlist, role) => rlist.find(x => x == `${roles[role]}`),
      {
        accessRoles: ctxRoles,
        c_type: qType

      } = script.context,
      isAdmin = hasRole(ctxRoles, 'Administrator')

// eslint-disable-next-line eqeqeq
if (qType == QueryType.System && !isAdmin) {
  faults.throw('axon.accessDenied.systemQueriesAdminsOnly')
}

return true