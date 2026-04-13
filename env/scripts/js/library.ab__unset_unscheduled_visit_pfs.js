import { trigger, log } from 'decorators'
import config from 'config'
import logger from 'logger'

class UnscheduledVisitPatientFlagsUnset {

  @log({ traceError: true })
  @trigger('update.after', {
    object: 'c_event',
    weight: 0,
    principal: 'c_system_user',
    if: {
      $and: [
        {
          $eq: [
            '$$ROOT.type',
            'c_visit_event'
          ]
        },
        {
          $or: [
            {
              $gte: [{
                $indexOfArray: [
                  '$$SCRIPT.arguments.modified',
                  'c_active'
                ]
              }, 0]
            },
            {
              $gte: [{
                $indexOfArray: [
                  '$$SCRIPT.arguments.modified',
                  'c_skipped'
                ]
              }, 0]
            }
          ]
        }
      ]
    }
  })
  eventAfterUpdate({ context, type, previous, current, modified }) {
    const visit = org.objects.c_visit.find({ _id: previous.c_schedule_visit._id }).toArray()[0]
    const isUnscheduledVisit = ['unscheduled', 'supplemental'].includes(visit.c_type)
    const publicUserID = previous.c_public_user._id
    if (isUnscheduledVisit) {
      if (
        (current.hasOwnProperty('c_active') && !previous.c_active && current.c_active === true) ||
        (current.hasOwnProperty('c_skipped') && !previous.c_skipped && current.c_skipped === true)
      ) {
        this.unsetUnscheduledPatientFlags(publicUserID)
      }
    }
  }

  unsetUnscheduledPatientFlags(publicUserID) {
    try {
      const unscheduledPatientFlags = config.get('ab__unscheduled_patient_flags')
      const setPatientFlags = org.objects.c_public_user.find({ _id: publicUserID }).paths('c_set_patient_flags')
        .skipAcl()
        .grant(consts.accessLevels.read)
        .toArray()[0].c_set_patient_flags
      unscheduledPatientFlags.forEach(patientFlagIdentifier => {
        const patientFlagAssignment = setPatientFlags.find(pf => pf.c_identifier === patientFlagIdentifier)
        if (patientFlagAssignment) {
          script.fire('c_flags_did_change', publicUserID, [patientFlagAssignment.c_flag._id])
          return org.objects.c_public_user.updateOne({ _id: publicUserID }, {
            $set: {
              c_set_patient_flags: [
                {
                  _id: patientFlagAssignment._id,
                  c_enabled: false
                }
              ],
              c_events_generating: true
            }
          })
            .skipAcl()
            .grant(consts.accessLevels.update)
            .execute()
        }
      })
    } catch (e) {
      logger.error('Error while unsetting unscheduled patient flags', e)
    }
  }
}