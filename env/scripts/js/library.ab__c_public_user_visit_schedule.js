/***********************************************************
@script     Public User Visit Schedule Update

@brief      This trigger is activated upon creation of c_public_user. If visit schedule count > 1, then unset c_visit_schedule else set the default visit schedule.

@author     Vinay Badhan

(c)2016-2024 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.
***********************************************************/
import { trigger, log } from 'decorators'
import logger from 'logger'

class PublicUserVisitSchedule {
  @log({ traceError: true })
  @trigger('create.after', {
    object: 'c_public_user',
    weight: 1,
    principal: 'c_system_user'
  })
  static updateVisitSchedule({ new: publicUser }) {
    const visitScheduleCount = org.objects.c_visit_schedule.count()
    if (visitScheduleCount === 1) {
      const defaultVisitSchedule = org.objects.c_study.find().paths('c_default_subject_visit_schedule').toArray()[0].c_default_subject_visit_schedule
      return org.objects.c_public_user.updateOne(
        { _id: publicUser._id },
        { $set: { c_visit_schedule: defaultVisitSchedule._id }}
      )
        .skipAcl()
        .grant(consts.accessLevels.update)
        .execute()
    }
  }
}