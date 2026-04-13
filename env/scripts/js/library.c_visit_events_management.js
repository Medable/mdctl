import { trigger, on, log, route, as } from 'decorators'
import faults from 'c_fault_lib'
import config from 'config'
import PatientFlagsLib from 'c_patient_flags_lib'
import { AnchorDate } from 'c_anchor_dates'
import NucleusUtils from 'c_nucleus_utils'

const { VISIT_CONFIRMATION } = AnchorDate.TEMPLATE_TYPES

const {
  c_events: Events,
  c_groups: Groups,
  event: EventScheduler,
  c_visits,
  c_public_users,
  c_studies
} = org.objects

const { accessLevels: { read, update, delete: deleteAccess } } = consts

const { id: { getIdOrNull } } = require('util')

const { error } = require('logger')

const moment = require('moment')

const visitActions = [
  'start', 'stop', 'skip'
]

class VisitEventsManagement {

  @trigger('create.after', { object: 'c_task_response' })
  static taskResponseCreateAfter() {

    const { new: newTaskResponse } = script.arguments

    const updatedEvent = this.updateTaskResponseEvent(newTaskResponse)

    // if the event was updated then we re-schedule the closing
    if (updatedEvent) {

      this.scheduleClosing(updatedEvent)
    }
  }

  /**
   * @trigger create before - c_event
   * @summary Event validation for new event and missed events
   * @params
   *  new event     { c_public_user: 'ObjectID', c_schedule_visit: 'ObjectID', type: 'c_visit_event' }
   *  missed event  { c_public_user: 'ObjectID', c_schedule_visit: 'ObjectID', type: 'c_visit_event', c_missed: true }
   */
  @trigger('create.before', {
    object: 'c_event',
    if: {
      $eq: [
        '$$ROOT.type',
        'c_visit_event'
      ]
    }
  })
  static eventCreateBefore() {

    const { new: newEvent } = script.arguments

    const publicUser = newEvent.c_public_user

    if (!publicUser) faults.throw('axon.invalidArgument.invalidVisitEvent')

    const visit = newEvent.c_schedule_visit

    if (!visit) faults.throw('axon.invalidArgument.invalidVisitEvent')

    const matchClause = this.getMatchingClause(getIdOrNull(publicUser, true), getIdOrNull(visit, true))

    if (!matchClause) faults.throw('axon.invalidArgument.invalidVisitEvent')

    const [event] = Events.aggregate([matchClause])
      .skipAcl()
      .grant(read)
      .limit(1)
      .toArray()

    if (event) faults.throw('axon.invalidArgument.existingActiveVisitEvent')

    const isMissed = newEvent.c_missed

    if (isMissed) {
      const missedDate = new Date()
        .toISOString()

      const missedEvent = {
        c_active: false,
        c_missed: true,
        c_missed_time: missedDate
      }

      newEvent.update(missedEvent)

      return
    }

    const isActive = newEvent.c_active

    if (isActive) {
      const startDate = new Date()
        .toISOString()

      const activeEvent = {
        c_active: true,
        c_missed: false,
        c_started: startDate
      }

      newEvent.update(activeEvent)

    }

  }

  /**
   * @trigger create after - c_event
   * @summary Schedules automatic closing of Visit Event when created
   */
  @trigger('create.after', {
    object: 'c_event',
    if: {
      $eq: [
        '$$ROOT.type',
        'c_visit_event'
      ]
    },
    weight: 1
  })
  static scheduleVisitClosing() {

    const { new: newEvent } = script.arguments

    const isNewVisitEvent = newEvent.type === 'c_visit_event' &&
      newEvent.c_active &&
      !newEvent.c_missed

    if (!isNewVisitEvent) return

    this.scheduleClosing(newEvent)
  }

  /**
   * @trigger create after - c_event
   * @summary Updates existing Visit Event when new Televisit Event is created
   */
  @trigger('create.after', {
    object: 'c_event',
    if: {
      $eq: [
        '$$ROOT.type',
        'c_televisit_event'
      ]
    },
    weight: 0
  })
  static eventCreateAfter() {

    const { new: newEvent } = script.arguments

    const updatedEvent = this.updateTelevisitEvent(newEvent)

    // if the event was updated then we re-schedule the closing
    if (updatedEvent) {

      this.scheduleClosing(updatedEvent)
    }
  }

  // trigger if this is of type 'c_visit_event' and we're changing c_active or c_missed
  @log({ traceResult: true, traceError: true })
  @trigger('update.after', {
    object: 'c_event',
    inline: true,
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
  static eventAfterUpdateInline({ new: newEvent, old: oldEvent, context }) {
    const visitEvent = { ...oldEvent, ...newEvent }

    if (newEvent.hasOwnProperty('c_active')) {

      if (newEvent.c_active === false) {
        const updateFields = {
          c_ended: new Date()
            .toISOString()
        }

        Events
          .updateOne({ _id: newEvent._id }, { $set: updateFields })
          .skipAcl()
          .grant(update)
          .execute()

        this.cancelScheduledClosing(newEvent)
      } else if (newEvent.c_active === true && !oldEvent.c_started) {

        const startDate = new Date()
          .toISOString()

        const updateFields = {
          c_skipped: false,
          c_started: startDate
        }

        Events
          .updateOne({ _id: newEvent._id }, { $set: updateFields })
          .skipAcl()
          .grant(update)
          .execute()
        this.setVisitFlagsAndAnchor(visitEvent)

      }
    } else if (newEvent.hasOwnProperty('c_skipped') && !oldEvent.c_skipped && newEvent.c_skipped === true) {

      const study = c_studies.readOne()
        .throwNotFound(false)
        .skipAcl()
        .grant(consts.accessLevels.read)
        .paths('c_visit_configuration')
        .execute()

      const {
        c_require_skipped_reason,
        c_allow_free_text_reason,
        c_skipped_visit_reasons = []
      } = study.c_visit_configuration

      if (c_require_skipped_reason && !newEvent.c_skipped_reason) {
        faults.throw('axon.invalidArgument.needSkippedReason')
      }

      if (!c_allow_free_text_reason && !c_skipped_visit_reasons.includes(newEvent.c_skipped_reason)) {
        faults.throw('axon.invalidArgument.noFreeTextReason')
      }

      const missedDate = new Date()
        .toISOString()

      const updateFields = {
        c_active: false,
        c_skipped_date: missedDate,
        c_skipped_reason: newEvent.c_skipped_reason
      }

      Events
        .updateOne({ _id: newEvent._id }, { $set: updateFields })
        .skipAcl()
        .grant(update)
        .execute()

      this.setVisitFlagsAndAnchor(visitEvent, true)
    }
  }

  @on('c_closing_visit_event')
  static closingVisitEvent(param) {

    const closingEvent = {
      c_active: false
    }

    Events
      .updateOne({ _id: param._id }, { $set: closingEvent })
      .skipAcl()
      .grant(update)
      .execute()

  }

  static scheduleClosing(visitEvent) {

    const endingTimeParams = { ending: 1000000, unit: 'h' }

    const configKey = config.get('axon__visit_event_ending_time')

    if (configKey) {

      const { ending, unit } = configKey

      if (!ending || Number.isNaN(ending)) {

        error('axon__visit_event_ending_time was set but \'ending\' is not a Number')
      } else {
        endingTimeParams.ending = ending
      }

      const availableUnits = ['h', 'm', 's', 'ms']

      if (!unit || !availableUnits.includes(unit)) {

        error('axon__visit_event_ending_time was set but \'unit\' is not a valid unit')
      } else {
        endingTimeParams.unit = unit
      }
    }

    const ENDING_TIME = moment()
      .add(endingTimeParams.ending, endingTimeParams.unit)
      .toISOString()

    const eventId = getIdOrNull(visitEvent, true)

    const exists = EventScheduler
      .find({ key: eventId })
      .skipAcl()
      .grant(read)
      .hasNext()

    if (exists) {

      const result = EventScheduler
        .updateOne({ key: eventId }, { $set: { start: ENDING_TIME } })
        .skipAcl()
        .grant(update)
        .execute()

      return result
    }

    const scheduledEvent = {
      type: 'script',
      key: eventId,
      event: 'c_closing_visit_event',
      principal: script.principal._id,
      start: ENDING_TIME,
      param: {
        _id: eventId
      }
    }

    return EventScheduler
      .insertOne(scheduledEvent)
      .grant(update)
      .bypassCreateAcl()
      .execute()

  }

  static cancelScheduledClosing(visitEvent) {

    const visitEventId = getIdOrNull(visitEvent, true)

    if (!visitEventId) return

    const eventSchedulerCursor = EventScheduler
      .find({ key: visitEventId })
      .skipAcl()
      .grant(read)

    const exists = eventSchedulerCursor
      .hasNext()

    if (exists) {

      const eventScheduler = eventSchedulerCursor.next()

      // only delete those that are pending
      if (eventScheduler.state < 2) {

        EventScheduler
          .deleteOne({ key: visitEventId })
          .skipAcl()
          .grant(deleteAccess)
          .execute()
      }

    }
  }

  static updateTelevisitEvent(televisitEvent) {

    const publicUser = televisitEvent.c_public_user

    if (!publicUser) return

    let group = televisitEvent.c_group

    if (!group) return

    group = Groups
      .find({ _id: group._id })
      .skipAcl()
      .grant(read)
      .next()

    const [visitId] = group.c_visits

    const matchClause = this.getMatchingClause(getIdOrNull(publicUser, true), visitId)

    if (!matchClause) return

    return this.updateEvent(matchClause, { c_televisit_events: televisitEvent._id })
  }

  static updateTaskResponseEvent(taskResponse) {

    const publicUser = taskResponse.c_public_user

    if (!publicUser) return

    const visit = taskResponse.c_visit

    if (!visit) return

    const matchClause = this.getMatchingClause(getIdOrNull(publicUser, true), getIdOrNull(visit, true))

    if (!matchClause) return

    return this.updateEvent(matchClause, { c_task_responses: taskResponse._id })
  }

  static updateEvent(matchClause, valueToPush) {

    // it is supposed to exist only one event per public user at the same time
    const [event] = Events.aggregate([matchClause])
      .skipAcl()
      .grant(read)
      .limit(1)
      .toArray()

    if (!event) return

    return Events
      .updateOne({ _id: event._id }, { $push: valueToPush })
      .skipAcl()
      .grant(update)
      .execute()
  }

  static getMatchingClause(publicUserId, visitId) {

    if (!publicUserId || !visitId) return

    return {
      $match: {
        type: 'c_visit_event',
        c_public_user: publicUserId,
        c_active: true,
        c_schedule_visit: visitId
      }
    }
  }

  @log({ traceResult: true, traceError: true })
  @as(script.principal, { safe: false, principal: { skipAcl: true, grant: 'update' } })
  static setVisitFlagsAndAnchor(visitEvent, skipped = false) {
    const publicUserFlagsUpdate = PatientFlagsLib.getFlagsUpdateVisit(visitEvent, skipped)
    let visitDate = new Date().toISOString()
    if (visitEvent.c_timezone) { // event timezone already validated if exists
      const moment = require('moment.timezone')
      visitDate = moment(visitDate)
        .tz(visitEvent.c_timezone)
        .format('YYYY-MM-DD')
    } else {
      visitDate = visitDate.substring(0, 10)
    }

    const anchorDate = new AnchorDate({
      type: VISIT_CONFIRMATION,
      visitId: visitEvent.c_schedule_visit._id,
      publicUserId: visitEvent.c_public_user._id,
      studyId: c_studies.find().next()._id,
      visitDate: visitDate
    })

    // Gets the visit confirmation anchor date by visit id, should only be one confirmation anchor date per visit
    const anchorDates = anchorDate.getAnchorDates()
    const updatedAnchorDates = anchorDates.map(v => v.c_template)
    script.fire('c_anchor_dates_did_change', visitEvent.c_public_user._id, updatedAnchorDates)
    const publicUserAnchorDateUpdate = { c_set_dates: anchorDates }

    const publicUserUpdate = publicUserFlagsUpdate // can be {} or have $push/$set attributes

    const anchorDatesUpdated = publicUserAnchorDateUpdate && !!Object.keys(publicUserAnchorDateUpdate).length

    if (anchorDatesUpdated) {
      if (publicUserUpdate.$push) {
        publicUserUpdate.$push = {
          ...publicUserUpdate.$push,
          ...publicUserAnchorDateUpdate
        }
      } else {
        publicUserUpdate.$push = { ...publicUserAnchorDateUpdate }
      }
    }

    const isUpdated = publicUserUpdate && !!Object.keys(publicUserUpdate).length

    if (isUpdated) {
      publicUserUpdate.$set = { ...(publicUserUpdate.$set || {}), c_events_generating: true }
      c_public_users
        .updateOne({ _id: visitEvent.c_public_user._id }, publicUserUpdate)
        .execute()
    }

  }

  static getOrCreateVisitEvent(publicUser, visit, allowCreate = true, timezone = null) {
    let visitEvent = Events.readOne({ type: 'c_visit_event', c_public_user: publicUser._id, c_schedule_visit: visit._id })
      .throwNotFound(false)
      .skipAcl()
      .grant(consts.accessLevels.read)
      .execute()

    if (!visitEvent && allowCreate) {
      visitEvent = Events.insertOne({
        type: 'c_visit_event',
        c_public_user: publicUser._id,
        c_schedule_visit: visit._id,
        ...(timezone ? { c_timezone: timezone } : {})
      })
        .lean(false)
        .execute()
    }

    return visitEvent

  }

  static startVisit(publicUser, visit, timezone) {
    const visitEvent = this.getOrCreateVisitEvent(publicUser, visit, true, timezone)

    if (!visitEvent.c_active && !visitEvent.c_started && !visitEvent.c_missed) {
      if (visit.c_set_subject_status_confirmed) {
        this.updateUserStatus(publicUser, visit.c_set_subject_status_confirmed)
      }

      return Events.updateOne({ _id: visitEvent._id }, {
        $set: {
          c_active: true,
          c_timezone: timezone // Ensure timezone is set even for existing events
        }
      })
        .lean(false)
        .execute()
    } else {
      // TODO: Fist this error
      faults.throw('axon.invalidArgument.invalidVisitEvent')
    }

  }

  static stopVisit(publicUser, visit) {
    const visitEvent = this.getOrCreateVisitEvent(publicUser, visit, false)

    if (!visitEvent) {
      // TODO: Fix error: Visit Doesn't exist
      faults.throw('axon.invalidArgument.invalidVisitEvent')
    }

    return Events.updateOne({ _id: visitEvent._id }, { $set: { c_active: false } })
      .lean(false)
      .execute()
  }

  static skipVisit(publicUser, visit, skippedReason, timezone) {
    const visitEvent = this.getOrCreateVisitEvent(publicUser, visit, true, timezone)

    if (!visitEvent.c_missed) {
      if (visit.c_set_subject_status_skipped) {
        this.updateUserStatus(publicUser, visit.c_set_subject_status_skipped)
      }

      return Events.updateOne({ _id: visitEvent._id }, {
        $set: {
          c_skipped: true,
          c_active: false,
          c_skipped_reason: skippedReason,
          c_timezone: timezone // Ensure timezone is set even for existing events
        }
      })
        .lean(false)
        .execute()
    } else {
      // TODO: Fist this error
      faults.throw('axon.invalidArgument.invalidVisitEvent')
    }

  }

  @log({ traceResult: true, traceError: true })
  @as(script.principal, { safe: false, principal: { skipAcl: true, grant: 'update' } })
  static updateUserStatus(publicUser, status) {
    return c_public_users.updateOne({ _id: publicUser._id }, { $set: { c_status: status } })
      .execute()
  }

  /**
   * @openapi
   * /visit/action:
   *  post:
   *    description: 'Start Visit'
   *    requestBody:
   *      description:
   *      required: true
   *      content:
   *        application/json:
   *          schema:
   *            type: object
   *            properties:
   *              c_public_user:
   *                type: string
   *                description: Public User ID
   *              c_visit:
   *                type: string
   *                description: Visit ID
   *              action:
   *                type: string
   *                description: the action start, stop, skip
   *              skippedReason:
   *                type: string
   *                description: The reason for missing the visit
   *              c_timezone:
   *                type: string
   *                description: The timezone to use for the visit date (e.g. 'America/New_York')
   *
   *    responses:
   *      '200':
   *        description: returns a c_task_response object
   */
  @log({ traceError: true })
  @route({
    method: 'POST',
    name: 'c_visit_action',
    path: 'visit/action',
    acl: ['account.anonymous']
  })
  static visitAction({ req, body }) {
    const { c_public_user, c_visit, action, skippedReason, c_timezone } = body()

    let validatedTimezone = 'UTC' // Default to UTC instead of null
    // Validate timezone if provided
    if (c_timezone) {
      const moment = require('moment.timezone')
      if (!moment.tz.zone(c_timezone)) {
        error(`Invalid timezone provided: ${c_timezone}. Defaulting to UTC.`)
      } else {
        validatedTimezone = c_timezone
      }
    }

    const publicUser = c_public_user && c_public_users.readOne({ _id: c_public_user })
      .throwNotFound(false)
      .skipAcl()
      .grant(consts.accessLevels.read)
      .execute()

    const visit = c_visit && c_visits.readOne({ _id: c_visit })
      .throwNotFound(false)
      .skipAcl()
      .grant(consts.accessLevels.read)
      .execute()

    if (!publicUser) {
      faults.throw('axon.invalidArgument.publicUserRequired')
    }

    if (!visit) {
      faults.throw('axon.invalidArgument.validVisitRequired')
    }

    const userSite = publicUser.c_site._id.toString()

    const isAdmin = script.principal.roleCodes.includes('administrator')
    const isSite = NucleusUtils.isNewSiteUser(script.principal.roles)

    if (!isAdmin && !isSite) {
      faults.throw('axon.accessDenied.routeAccessDenied')
    }

    // If they're a site user, verify they have access to the right site
    if (isSite) {
      const { c_site_access_list } = org.objects.accounts.find({ _id: script.principal._id })
        .skipAcl()
        .grant(4)
        .paths('c_site_access_list')
        .next()

      if (!c_site_access_list.map(v => v.toString())
        .includes(userSite)) {
        faults.throw('axon.accessDenied.routeAccessDenied')
      }
    }

    if (!visitActions.includes(action)) {
      faults.throw('axon.invalidArgument.axon.invalidArgument.invalidVisitAction')
    }

    const study = c_studies
      .readOne()
      .throwNotFound(false)
      .skipAcl()
      .grant(consts.accessLevels.read)
      .paths('c_visit_configuration')
      .execute()

    const { c_require_skipped_reason } = study.c_visit_configuration

    if (c_require_skipped_reason && !skippedReason) {
      faults.throw('axon.invalidArgument.skippedReasonRequired')
    }

    if (!study) {
      faults.throw('axon.invalidArgument.validStudyRequired')
    }

    switch (action) {
      case 'start':
        return this.startVisit(publicUser, visit, validatedTimezone)
      case 'stop':
        return this.stopVisit(publicUser, visit)
      case 'skip':
        return this.skipVisit(publicUser, visit, skippedReason, validatedTimezone)
      default:
        faults.throw('axon.invalidArgument.invalidAction')
    }
  }

}

module.exports = VisitEventsManagement