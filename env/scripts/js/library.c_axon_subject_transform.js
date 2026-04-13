/***********************************************************

@script     Subject List transform: Library

@brief      A transform to act on c_public_users to add properties necessary for subject management in a clinical site

@author     Fiachra Matthews

@version    1.0.0

(c)2016-2018 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/

import moment from 'moment.timezone'
import logger from 'logger'
import _ from 'lodash'

const { transform } = require('decorators-transform')
const { c_visit_schedules, c_queries } = org.objects

@transform
class SubjectListTransform {

  beforeAll(memo) {
    memo.today = moment()
      .format('YYYY-MM-DD')
    memo.visitSchedules = {}
  }

  each(subject, memo) {

    const { visitSchedules, today } = memo

    if (subject.c_visit_schedule) {
      const vs = this.findAndCacheVisitSchedule(subject.c_visit_schedule._id, visitSchedules)

      vs && this.setNextVisitBySchedule(subject, vs, today)
    }

    subject.c_query_count = c_queries.find({ c_subject: subject._id })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .count()

    if (!memo.unblinded) {
      if (subject.c_participant_name_or_email) {
        subject.c_participant_name_or_email = ''
      }
      if (subject.c_email) {
        delete subject.c_email
      }
    }

    return subject
  }

  findAndCacheVisitSchedule(visitScheduleId, store) {

    let visitSchedule = store[visitScheduleId]

    if (visitSchedule) return visitSchedule

    visitSchedule = script.as(script.principal, { principal: { grant: consts.accessLevels.read, skipAcl: true } }, () => {
      const visitSchedule = c_visit_schedules
        .readOne({ _id: visitScheduleId })
        .throwNotFound(false)
        .expand('c_visits.c_anchor_date', 'c_default_anchor_date')
        .paths('c_visits.created', 'c_default_anchor_date', 'c_visits.c_name', 'c_visits.c_schedule.c_days_from_start', 'c_visits.c_schedule.c_plus', 'c_visits.c_schedule.c_minus', 'c_visits.c_anchor_date', 'c_visits.c_groups')
        .execute()

      return visitSchedule
    })

    if (visitSchedule) {
      visitSchedule.c_visits.data = visitSchedule.c_visits.data.filter(v => v.c_schedule && ('c_days_from_start' in v.c_schedule))
      visitSchedule.c_visits.data.sort((a, b) => {
        if (a.c_schedule.c_days_from_start === b.c_schedule.c_days_from_start) {
          return a.c_name.localeCompare(b.c_name)
        } else {
          return a.c_schedule.c_days_from_start - b.c_schedule.c_days_from_start
        }
      })
      store = { ...store, ...{ [visitSchedule._id]: visitSchedule } }
    }

    return visitSchedule
  }

  getVisitDatesForUser(subject, visitSchedule) {
    return visitSchedule.c_visits.data.reduce((a, visit) => {
      const visitAnchor = visit.c_anchor_date || visitSchedule.c_default_anchor_date
      const setAnchorDate = visitAnchor && subject.c_set_dates && subject.c_set_dates.find(v => v.c_template._id.equals(visitAnchor._id))
      // TODO: Check if we really need to use baseline date here
      const date = (setAnchorDate && setAnchorDate.c_date) || subject.c_baseline_date

      if (date) {
        const visitDate = {
          date: moment(date)
            .add(visit.c_schedule.c_days_from_start, 'days'),
          visit
        }

        if (visit.c_schedule.c_minus || visit.c_schedule.c_plus) {
          let c_window_start = visit.c_schedule.c_days_from_start
          let c_window_end = visit.c_schedule.c_days_from_start

          if (visit.c_schedule.c_minus) {
            c_window_start -= visit.c_schedule.c_minus
          }

          if (visit.c_schedule.c_plus) {
            c_window_end += visit.c_schedule.c_plus
          }

          visitDate.c_window_start = moment(date)
            .add(c_window_start, 'days')
          visitDate.c_window_end = moment(date)
            .add(c_window_end, 'days')
        }

        a.push(visitDate)
      }

      return a
    }, [])

  }

  getLowestSequenceVisit(visits) {
    const [visit] = visits
      .filter(x => _.get(x, 'visit.c_groups.data[0].c_sequence') >= 0)
      .sort((x, y) => _.get(x, 'visit.c_groups.data[0].c_sequence') - _.get(y, 'visit.c_groups.data[0].c_sequence'))
    return visit
  }

  getFirstCreatedVisit(visits) {
    const [visit] = visits
      .sort((x, y) => moment(x.visit.created) - moment(y.visit.created))
    return visit
  }

  setNextVisitBySchedule(subject, visitSchedule, todayISOString) {

    const setVisits = this.getVisitDatesForUser(subject, visitSchedule)

    if (setVisits.length) {
      let foundVisit = setVisits.find(v => v.date.isSameOrAfter(moment(todayISOString)))

      if (foundVisit) {
        const sameDateVisits = setVisits.filter(v => v.date.isSame(moment(foundVisit.date)))

        if (sameDateVisits.length > 1) {
          const lowestSequenceVisit = this.getLowestSequenceVisit(sameDateVisits)

          if (lowestSequenceVisit) {
            foundVisit = lowestSequenceVisit
          } else {
            const firstCreatedVisit = this.getFirstCreatedVisit(sameDateVisits)
            foundVisit = firstCreatedVisit
          }

        }

        subject.c_next_visit = foundVisit.visit
        subject.c_next_visit_date = foundVisit.date.format('YYYY-MM-DD')
        subject.c_next_visit_window_start = foundVisit.c_window_start && foundVisit.c_window_start.format('YYYY-MM-DD')
        subject.c_next_visit_window_end = foundVisit.c_window_end && foundVisit.c_window_end.format('YYYY-MM-DD')
      }
    }
  }

}
module.exports = SubjectListTransform