import validator from 'c_axon_assets_validation_library'
import faults from 'c_fault_lib'

if (validator.checkIfFileNamesAreDup(script.arguments.new)) faults.throw('axon.invalidArgument.duplicateFilenames')