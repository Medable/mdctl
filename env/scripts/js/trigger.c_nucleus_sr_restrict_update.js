import NucleusUtils from 'c_nucleus_utils'
import faults from 'c_fault_lib'
import nucPermissions from 'c_nucleus_permissions'
// c_value and c_file properties of consent reviews can't be edited
if (
  !script.principal.email === nucPermissions.SystemUser.name &&
    script.arguments.old.type === 'c_consent_review' &&
    (script.arguments.new.hasOwnProperty('c_value') || script.arguments.new.hasOwnProperty('c_file'))
) {
  throw Fault.create({ errCode: 'cortex.accessDenied.instanceUpdate' })
}

NucleusUtils.AclManagment.canEditStepResponses()

return true