import request from 'request'
import config from 'config'
import { transform } from 'decorators-transform'

@transform
class SupplementalUnscheduledVisitScheduleOverride {
  beforeAll() {
    this.setAnchorDates = script.as('c_system_user', { safe: false, principal: { skipAcl: true, grant: 'read' } }, () => {
      return org.objects.c_public_user.find({_id: request.params.publicUserId})
        .paths('c_set_dates')
        .toArray()[0]
        .c_set_dates
        .map(csd => csd.c_template._id.toString())
    })
    this.visitStartAnchorMap = config.get('ab__visit_start_anchor_map')
  }

  each(visitObject) {
    const visit = this.getVisitById(String(visitObject.c_visit))

    if (!visit || !visit._id || visitObject.c_completed_assignments) {
      return visitObject
    }

    const isSupplementalVisit = visit.c_type === 'supplemental'
    const isUnscheduledVisit = visit.c_type === 'unscheduled'
    const isFollowUpVisit = visit.c_type === 'follow_up'

    // standard/early withdrawal visits are not affected by this policy
    if (!isSupplementalVisit && !isUnscheduledVisit && !isFollowUpVisit) {
      return visitObject
    }

    if (this.setAnchorDates.includes(this.visitStartAnchorMap[visit._id].toString())) {
      return visitObject
    }
  }

  getVisitById(_id) {
    return org.objects.c_visit
      .find({ _id: _id })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()[0]
  }
}

module.exports = SupplementalUnscheduledVisitScheduleOverride
