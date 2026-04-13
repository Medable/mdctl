/***********************************************************

@script     CS - Time Travel
@brief      Backdate Participant (time travel)

@author     Ante Pupacic, Marko Radovcic

// Usage script example (time travel 2 days):
import { backdateParticipant } from "c_cs_time_travel"

const publicUser = org.objects.c_public_user
  .find({
    c_email: "email@medable.com",
  })
  .next()

backdateParticipant(publicUser, 2)

// Usage for site user notifications (time travel 2 days):
import { backdateSiteUser } from "c_cs_time_travel"

const siteUserAcc = org.objects.account.find({email: 'email@medable.com'}).skipAcl().grant(consts.accessLevels.read).next()

backdateSiteUser(siteUserAcc, 2)

***********************************************************/

import logger from 'logger'
import moment from 'moment.timezone'
import { AdvanceTaskScheduling } from 'c_axon_adv_task_scheduler'
import { transform } from 'decorators'
const dependentTaskEventType = 'c_dependent_task_event'
const PARTICIPANT_OBJECT_TYPE = 'c_public_user'
const ACCOUNT_OBJECT_TYPE = 'account'

const getMissedEventKey = event => {
  if (event.c_hash) {
    return `missed-event-${event.c_hash}`
  }

  return `missed-event-${event._id.toString()}`
}

/**
 * @param {object} publicUser - c_public_user object
 * @param {number} days - number of days to backdate the participant
 * @returns {string} - Returns string if events are generating atm
 */
function backdateParticipant(publicUser, days) {
  const timezone = publicUser.c_tz || 'UTC'
  if (publicUser.c_events_generating) return 'Try again later!'
  backdateAnchorDates(publicUser, days, timezone)
  // everything up to this point is run in sync - only c_events are run async
  // and when this is finished, it is shown in debug messages.
  backdateNotifsAsync(publicUser, days, timezone)
  backdateAxonNotifsAsync(publicUser, days, timezone)
  backdateTasksAndStepsAsync(publicUser, days, timezone)
  backdateAllEventsAsync(publicUser, days, timezone)
}

function backdateSiteUser(siteUser, days) {
  const timezone = siteUser.c_tz || 'UTC'
  backdateNotifsAsync(siteUser, days, timezone)
}

/**
 * @param {object} publicUser - c_public_user object
 * @param {number} days - number of days to backdate the participant
 */
function backdateAnchorDates(publicUser, days) {
  const updatedSetDates = publicUser.c_set_dates.map(setDate => {
    const newDate = new Date(setDate.c_date)
    newDate.setDate(newDate.getDate() - days)
    return {
      _id: setDate._id, // Important to keep the _id for potential future targeted updates
      c_template: setDate.c_template._id,
      c_date: newDate.toDateString()
    }
  })

  org.objects.c_public_user
    .updateOne(
      { _id: publicUser._id },
      { $set: { c_set_dates: updatedSetDates } }
    )
    .skipAcl()
    .grant(consts.accessLevels.update)
    .execute()

  logger.debug(
    `backdateAnchorDates finished: Backdated ${publicUser.c_set_dates.length} anchor dates for ${publicUser.c_username}.`
  )
}

/**
 * @param {object} publicUser - Public user for whom event will be backdated
 * @param {number} days - Number of days to backdate the event
 */
function backdateComplianceNotifEvent(publicUser, days) {
  // **Read the relevant Event object once**
  const event = org.objects.Events.readOne({
    key: { $regex: `/cs__compliance_notification_daily.${publicUser.c_site._id.toString()}/` }
  })
    .skipAcl()
    .grant(consts.accessLevels.script)
    .throwNotFound(false)
    .execute()

  // **Exit early if the event is not found**
  if (!event) {
    return
  }

  // **Calculate the new date using moment.js**
  const newDateMoment = moment(event.start).subtract(days, 'days')
  const nowMoment = moment()
  let updatedStartDate

  // **Determine the start date for the update based on the condition**
  if (newDateMoment.isBefore(nowMoment)) {
    updatedStartDate = nowMoment.toDate()
  } else {
    updatedStartDate = newDateMoment.format()
  }

  // **Perform a single update operation**
  org.objects.Events
    .updateOne(
      { _id: event._id },
      {
        $set: {
          start: updatedStartDate
        }
      }
    )
    .skipAcl()
    .grant(consts.accessLevels.script)
    .execute()
}

/**
 * @param {object} publicUser - c_public_user object
 */
function rescheduleATS(publicUser) {
  if (isSchedulerServiceEnabled()) {
    return AdvanceTaskScheduling.regenerateEvents([publicUser._id])
  }

  const updatedAssignments = getAssignments(publicUser)

  org.objects.c_generation_trigger
    .insertOne({
      c_public_user: publicUser._id,
      c_type: 'anchor-date',
      c_updated_assignments: updatedAssignments
    })
    .bypassCreateAcl()
    .execute()
  // Backdate anchor needs to be called after and will trigger generate events

  AdvanceTaskScheduling.generateEventsForUser(publicUser._id)

  logger.debug('Refresh ATS events for users triggered.')
}

@transform('c_backdate_notifs')
// eslint-disable-next-line no-unused-vars
class BackdateNotifs {

  error(e) {
    logger.debug(e)
    throw e
  }

  beforeAll(memo) {
    memo.todaysDate = moment()
      .tz(memo.timezone)
      .startOf('day')
      .tz('Etc/GMT')
      .format()
  }

  each(notif, { timezone, days, todaysDate, collection }) {
    const moment = require('moment.timezone')
    let newDate = moment(notif.c_date)
      .tz(timezone)
      .subtract(days, 'days')
      .tz('Etc/GMT')
      .format(),
      newBaselineDate
    const notifEvents = org.objects.Event.find({
      key: { $regex: `/${notif._id.toString()}/` }
    })
      .skipAcl()
      .grant(consts.accessLevels.read)

    if (notif.c_baseline_date) {
      newBaselineDate = moment(notif.c_baseline_date)
        .tz(timezone)
        .subtract(days, 'days')
        .tz('Etc/GMT')
        .format()
    }

    if (moment(newDate)
      .isBefore(todaysDate)) {
      if (notif.c_recurring) {
        let addIteration = 0
        while (moment(newDate)
          .isBefore(todaysDate)) {
          newDate = moment(newDate)
            .tz(timezone)
            .add(notif.c_recurrence.c_interval.toString(), notif.c_recurrence.c_unit.toString())
            .tz('Etc/GMT')
            .format()
          addIteration++
        }
        const updateObj = { c_date: newDate }
        if (newBaselineDate) {
          updateObj.c_baseline_date = newBaselineDate
          updateObj.c_iteration = notif.c_iteration + addIteration
        }
        org.objects[collection]
          .updateOne({ _id: notif._id }, { $set: updateObj })
          .skipAcl()
          .grant(consts.accessLevels.update)
          .execute()
      } else {
        const updateObj = { 
          c_date: newDate, 
          c_status: 'canceled', 
          c_canceled_reason: 'Notification backdated to past date during time travel' 
        }
        if (newBaselineDate) {
          updateObj.c_baseline_date = newBaselineDate
        }
        org.objects[collection]
          .updateOne(
            { _id: notif._id },
            { $set: updateObj }
          )
          .skipAcl()
          .grant(consts.accessLevels.update)
          .execute()
      }
    } else {
      const updateObj = { c_date: newDate }
      if (newBaselineDate) {
        updateObj.c_baseline_date = newBaselineDate
      }
      org.objects[collection]
        .updateOne({ _id: notif._id }, { $set: updateObj })
        .skipAcl()
        .grant(consts.accessLevels.update)
        .execute()
    }

    if (notifEvents.hasNext()) {
      notifEvents.forEach(event => {
        org.objects.Event.updateOne(
          { _id: event._id },
          {
            $set: {
              start: newDate
            }
          }
        )
          .skipAcl()
          .grant(consts.accessLevels.update)
          .execute()
      })
    }
  }

}

/**
 * @param {object} publicUser - c_public_user object
 * @param {number} days - number of days to backdate the participant
 * @param {string} timezone - c_public_user.c_tz
 * @returns {object} operation
 */
function backdateNotifsAsync(user, days, timezone) {
  if (!org.objects.objects.find({ name: 'c_notif' })
    .skipAcl()
    .grant(consts.accessLevels.read)
    .hasNext()) { return }

  if (user.object === PARTICIPANT_OBJECT_TYPE) {
    return org.objects.bulk()
    .add(org.objects.c_notifs.find({ c_recipient: user.c_account._id, c_status: 'scheduled' })
      .skipAcl()
      .grant(consts.accessLevels.read), { wrap: false })
    .transform({ autoPrefix: true, memo: { timezone, days, collection: 'c_notifs' }, script: 'c_backdate_notifs' })
    .async()
    .next()
  } else if (user.object === ACCOUNT_OBJECT_TYPE) {
    return org.objects.bulk()
    .add(org.objects.c_notifs.find({ c_recipient: user._id, c_status: 'scheduled' })
      .skipAcl()
      .grant(consts.accessLevels.read), { wrap: false })
    .transform({ autoPrefix: true, memo: { timezone, days, collection: 'c_notifs' }, script: 'c_backdate_notifs' })
    .async()
    .next()
  }

}

/**
 * @param {object} publicUser - c_public_user object
 * @param {number} days - number of days to backdate the participant
 * @param {string} timezone - c_public_user.c_tz
 * @returns {object} operation
 */
function backdateAxonNotifsAsync(publicUser, days, timezone) {
  if (!org.objects.objects.find({ name: 'c_axon_notif' })
    .skipAcl()
    .grant(consts.accessLevels.read)
    .hasNext()) { return }

  return org.objects.bulk()
    .add(org.objects.c_axon_notifs.find({ c_public_user: publicUser._id, c_status: 'scheduled' })
      .skipAcl()
      .grant(consts.accessLevels.read), { wrap: false })
    .transform({ autoPrefix: true, memo: { timezone, days, collection: 'c_axon_notifs' }, script: 'c_backdate_notifs' })
    .async({
      onComplete: `
        import logger from 'logger'
        if (!script.arguments.err) {
          logger.debug('backdateAllAxonNotifsAsync finished for ${publicUser.c_username}.')
        }
        else {
          logger.error(script.arguments.err)
        }
      `
    })
    .next()
}

@transform('c_backdate_tasks')
// eslint-disable-next-line no-unused-vars
class BackdateTasks {

  error(e) {
    logger.debug(e)
    throw e
  }

  beforeAll(memo) {
    memo.todaysDate = moment()
      .tz(memo.timezone)
      .startOf('day')
      .tz('Etc/GMT')
      .format()
  }

  each(taskResponse, { timezone, days }) {
    const moment = require('moment.timezone'),
      newStart = moment(taskResponse.c_start)
        .tz(timezone)
        .subtract(days, 'days')
        .tz('Etc/GMT')
        .format(),
      newEnd = moment(taskResponse.c_end)
        .tz(timezone)
        .subtract(days, 'days')
        .tz('Etc/GMT')
        .format()

    org.objects.c_task_responses
      .updateOne(
        { _id: taskResponse._id },
        {
          $set: {
            c_start: newStart,
            c_end: newEnd
          }
        }
      )
      .skipAcl()
      .grant(consts.accessLevels.update)
      .execute()

    org.objects.c_step_responses
      .updateMany(
        { c_task_response: taskResponse._id },
        {
          $set: {
            c_start_date: newStart,
            c_end_date: newEnd
          }
        }
      )
      .skipAcl()
      .grant(consts.accessLevels.update)
      .execute()

  }

}

/**
 * @param {object} publicUser - c_public_user object
 * @param {number} days - number of days to backdate the participant
 * @param {string} timezone - c_public_user.c_tz
 * @returns {object} operation
 */
function backdateTasksAndStepsAsync(publicUser, days, timezone) {
  return org.objects.bulk()
    .add(org.objects.c_task_responses
      .find({ c_public_user: publicUser._id })
      .skipAcl()
      .grant(consts.accessLevels.read), { wrap: false })
    .transform({ autoPrefix: true, memo: { timezone, days }, script: 'c_backdate_tasks' })
    .async()
    .next()
}

@transform('c_backdate_events')
// eslint-disable-next-line no-unused-vars
class BackdateEvents {

  error(e) {
    logger.debug(e)
    throw e
  }

  beforeAll(memo) {
    memo.cortexEventsToUpdate = []
  }

  each(operationResult, { timezone, days, cortexEventsToUpdate }) {
    const event = operationResult.data

    const eventStartDate = moment(event.c_start)
      .tz(timezone)
      .subtract(days, 'days')
      .tz('Etc/GMT')
    const eventEndDate = moment(event.c_end)
      .tz(timezone)
      .subtract(days, 'days')
      .tz('Etc/GMT')

    const missedEventTriggerTime = eventEndDate.isBefore(moment()) ? moment() : eventEndDate
    const missedEventKey = getMissedEventKey(event)
    cortexEventsToUpdate.push({ key: missedEventKey, start: missedEventTriggerTime.toISOString() })

    return org.objects.c_events
      .updateOne(
        { _id: event._id },
        {
          $set: {
            c_start: eventStartDate.toISOString(),
            c_end: eventEndDate.toISOString()
          }
        }
      )
      .skipAcl()
      .grant(consts.accessLevels.update)
      .execute()
  }

}

@transform('c_backdate_cortex_events')
// eslint-disable-next-line no-unused-vars
class BackdateCortexEvents {

  error(e) {
    throw e
  }

  each(operationResult, { cortexEventsToUpdate }) {
    const event = operationResult.data
    const timeForUpdate = cortexEventsToUpdate.find(x => x.key === event.key).start

    return org.objects.Event.updateOne(
      { _id: event._id },
      {
        $set: {
          start: timeForUpdate
        }
      }
    )
      .skipAcl()
      .grant(consts.accessLevels.update)
      .execute()
  }

}

/**
 * @param {object} publicUser - c_public_user object
 * @param {number} days - number of days to backdate the participant
 * @param {string} timezone - c_public_user.c_tz
 */
function backdateAllEventsAsync(publicUser, days, timezone) {
  org.objects
    .bulk()
    .add(getEventsCursorForTimeTravel(publicUser._id.toString()))
    .transform({ autoPrefix: true, memo: { timezone, days }, script: 'c_backdate_events' })
    .async({
      onComplete: `
        org.objects
          .bulk()
          .add(
            org.objects.Event.find({ key: { $in: script.arguments.memo.cortexEventsToUpdate.map(x => x.key) } })
              .skipAcl()
              .grant(consts.accessLevels.script)
              .paths('key', '_id')
          )
          .transform({ autoPrefix: true, memo: { cortexEventsToUpdate: script.arguments.memo.cortexEventsToUpdate }, script: 'c_backdate_cortex_events' })
          .async({
            onComplete: \`
              import logger from 'logger'
              if (!script.arguments.err) {
                logger.debug('backdateAllEventsAsync finished for ${publicUser.c_username}.')
              }
              else {
                logger.error(script.arguments.err)
              }
            \`
          })
          .next()
      `
    })
    .next()

  logger.debug(
    `backdateAllEventsAsync started: Backdating events for ${publicUser.c_username}.`
  )
}

export {
  backdateParticipant,
  backdateSiteUser,
  rescheduleATS,
  backdateComplianceNotifEvent
}

/**
 * @param {object} publicUser - c_public_user object
 * @returns {Array|string} Array of c_task_assignments ObjectIDs
 */
function getAssignments(publicUser) {
  const anchorDateTemplateIds = publicUser.c_set_dates.map(
    sd => sd.c_template._id
  )
  return org.objects.c_task_assignments
    .find({
      $or: [
        { 'c_start_date.c_anchor_date_template': { $in: anchorDateTemplateIds } },
        { 'c_end_date.c_anchor_date_template': { $in: anchorDateTemplateIds } }
      ]
    })
    .paths('_id')
    .skipAcl()
    .grant('read')
    .map(v => v._id)
}

/**
 * @param {string} publicUserId - c_public_user ObjectID
 * @returns {object} - event object with id, start, end
 */
function getEventsCursorForTimeTravel(publicUserId) {
  return org.objects.c_event.find({ c_public_user: publicUserId })
    .skipAcl()
    .grant(consts.accessLevels.read)
    .sort({ c_start: 1 })
    .expressionPipeline([
      {
        $match: {
          $or: [
            { $ne: ['$$ROOT.type', dependentTaskEventType] },
            {
              $lte: ['$$ROOT.c_end', moment()
                .format()]
            },
            {
              $eq: ['$$ROOT.c_all_dependencies_met', true]
            }
          ]
        }
      },
      {
        $project: {
          _id: '$$ROOT._id',
          c_hash: '$$ROOT.c_hash',
          c_start: '$$ROOT.c_start',
          c_end: '$$ROOT.c_end'
        }
      }
    ])
}

function isSchedulerServiceEnabled() {
  return org.objects.org.find()
    .paths('apps.name', 'apps.enabled')
    .skipAcl()
    .grant(consts.accessLevels.read)
    .next()
    .apps
    .some(app => app.name === 'scheduler__app' && app.enabled)
}