/***********************************************************

@script    Axon - Visits Lib

@brief     Library to ensure data consistency when updating visits and visit schedules

@author    Emily Ackerman

(c)2016-2022 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import {
  trigger,
  log
} from 'decorators'

import logger from 'logger'

const {
  c_visits,
  c_groups,
  c_studies,
  c_patient_flag,
  c_anchor_date_template
} = org.objects

class VisitLibrary {

  @log({ traceError: true })
  @trigger('delete.before', { object: 'c_visit_schedule', weight: 1 })
  static beforeVisitScheduleDelete({ context }) {
    // when a visit schedule is deleted, first delete all visits in that visit schedule
    const visitSchedule = context._id

    return c_visits.deleteMany({ c_visit_schedules: visitSchedule })
      .skipAcl()
      .grant(consts.accessLevels.delete)
      .execute()
  }

  @log({ traceError: true })
  @trigger('delete.after', { object: 'c_visit', weight: 1 })
  static afterVisitDelete({ context }) {
    // remove references to the visit that was just deleted
    return c_groups.updateMany({ c_visits: context._id }, { $set: { c_visits: [] } })
      .skipAcl()
      .grant(consts.accessLevels.update)
      .execute()
  }

  @log({ traceError: true })
  @trigger('create.after', { object: 'c_visit', inline: true, weight: 1 })
  static afterVisitCreate({ context }) {
    let study
    try {
      study = c_studies.find()
        .next()
    } catch (error) {
      logger.error(error)
    }

    const confirmFlag = c_patient_flag.insertOne({
      c_study: study._id,
      c_identifier: `${script.arguments.new.c_name}_flag_confirmed`,
      c_label: `${script.arguments.new.c_name} - Flag`,
      c_conditions: [{
        c_enable: true,
        c_visit: script.arguments.new._id,
        c_type: 'visitConfirmation'
      }]
    })
      .lean(false)
      .execute()

    const skippedFlag = c_patient_flag.insertOne({
      c_study: study._id,
      c_identifier: `${script.arguments.new.c_name}_flag_skipped`,
      c_label: `${script.arguments.new.c_name} - Flag`,
      c_conditions: [{
        c_enable: true,
        c_visit: script.arguments.new._id,
        c_type: 'visitConfirmation'
      }]
    })
      .lean(false)
      .execute()

    const visitAnchor = c_anchor_date_template.insertOne({
      c_study: study._id,
      c_identifier: `${script.arguments.new.c_name}_date`,
      c_visit: script.arguments.new._id,
      c_type: 'VisitConfirmation'
    })
      .lean(false)
      .execute()

    if (study && !script.arguments.new.c_visit_flag) {
      c_visits.updateOne({ _id: context._id }, {
        $set: {
          c_visit_flag_confirmed: confirmFlag._id,
          c_visit_flag_skipped: skippedFlag._id,
          c_visit_confirmation_anchor: visitAnchor._id
        }
      })
        .execute()
    }
  }

}

module.exports = VisitLibrary