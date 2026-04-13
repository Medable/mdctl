import faults from 'c_fault_lib'
// consent reviews can't be edited
if (script.arguments.old.type === 'c_consent_review') {
  throw Fault.create({ errCode: 'cortex.accessDenied.instanceDelete' })
}