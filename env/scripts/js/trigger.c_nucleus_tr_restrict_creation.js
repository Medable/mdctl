import NucleusUtils from 'c_nucleus_utils'
import logger from 'logger'

if (script.parent && (script.parent.label === 'Axon - Create Public Task Response')) {
  return true
} else {
  NucleusUtils.AclManagment.canCreateResponses()
}

return true