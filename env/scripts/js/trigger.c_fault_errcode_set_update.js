import faults from 'c_fault_lib'

// If err_code isn't set on creation then is it set
if (!script.arguments.new.c_error_code) {
  const obj = Object.assign(script.arguments.old, script.arguments.new)
  const c_error_code = faults.getErrorCode(obj)
  script.arguments.new.update({ c_error_code })
}