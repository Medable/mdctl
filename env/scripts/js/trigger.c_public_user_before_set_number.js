import faults from 'c_fault_lib'
import cache from 'cache'

if (script.arguments.new.c_number === script.arguments.old.c_number) return

if (cache.has(`autoUpdatePU_${script.arguments.old._id}`)) return

const study = org.objects.c_study
  .find({ _id: script.arguments.old.c_study._id })
  .skipAcl()
  .grant(consts.accessLevels.read)
  .next()
// Prevent manually enter a participant ID
if ((!study.hasOwnProperty('c_automatic_participant_id_generation') || study.c_automatic_participant_id_generation) && script.arguments.new.c_number) {
  faults.throw('axon.validationError.participantIDMustBeSystemGenerated')
}