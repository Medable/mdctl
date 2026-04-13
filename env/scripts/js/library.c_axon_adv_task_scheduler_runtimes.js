import moment from 'moment.timezone'
import {
  route,
  log,
  trigger,
  on,
  as
} from 'decorators'
import response from 'response'
import logger from 'logger'
import { isIdFormat } from 'util.id'
import { AdvanceTaskScheduling } from 'c_axon_adv_task_scheduler'
import faults from 'c_fault_lib'
import { paths } from 'util'
import PatientFlagsLib from 'c_patient_flags_lib'
import { AnchorDateLib } from 'c_anchor_dates'
import Scheduler from 'scheduler__library'
import _ from 'lodash'
import config from 'config'

const {
  c_public_users,
  c_events,
  c_study: Study,
  c_schedule_assignments
} = org.objects
const { accessLevels, principals } = consts

const schedulerConfigs = config('scheduler__configs')

export class AdvanceTaskSchedulerRuntimes {

  /**
   * @openapi
   * /c_public_users/{publicUserId}/task_definitions/{taskId}:
   *  get:
   *    description: 'c_participant_task_definitions'
   *    parameters:
   *      - name: publicUserId
   *        in: path
   *        required: true
   *        description:
   *        schema:
   *          type: string
   *      - name: taskId
   *        in: path
   *        required: false
   *        description:
   *        schema:
   *          type: string
   *
   *    responses:
   *      '200':
   *        description: c_task object
   *        content:
   *          application/json:
   *            schema:
   *              $ref: '#/components/schemas/c_task'
   *      '400':
   *        description: cortex.accessDenied.instanceRead
   */
  @log({ traceError: true })
  @route({
    method: 'GET',
    name: 'c_participant_task_definitions',
    path: 'c_public_users/:publicUserId/task_definitions/:taskId?',
    acl: ['account.anonymous']
  })
  static runtimeTaskDefRoute({ req }) {
    const { publicUserId } = req.params
    if (publicUserId && !isIdFormat(publicUserId)) {
      faults.throw('axon.invalidArgument.invalidObjectId')
    }
    const publicUser = c_public_users.find({ _id: req.params.publicUserId })
      .paths('c_account')
      .skipAcl()
      .grant(accessLevels.read)
      .next()

    // permissions setup
    // - anonymous if the public user hasn't been registered
    // - administrators for ease of testing
    // - if the calling principal is the owner of the public user

    if ((script.principal._id.equals(principals.anonymous) && !publicUser.c_account) ||
      /* eslint-disable-next-line eqeqeq */
      (script.principal.roles.find(v => v == `${consts.roles.Administrator}`)) ||
      (publicUser.c_account && publicUser.c_account._id.equals(script.principal._id))) {
      return AdvanceTaskScheduling.getParticipantTaskDefinitions(req.params.publicUserId, req.query, req.params.taskId)
    } else {
      faults.throw('cortex.accessDenied.instanceRead')
    }

  }

  /**
   * @openapi
   * /c_public_users/{publicUserId}/c_events/{eventId}:
   *  get:
   *    description: 'c_participant_events'
   *    parameters:
   *      - name: eventId
   *        in: path
   *        required: false
   *        description:
   *        schema:
   *          type: string
   *      - name: publicUserId
   *        in: path
   *        required: true
   *        description:
   *        schema:
   *          type: string
   *
   *    responses:
   *      '200':
   *        description: c_event object
   *        content:
   *          application/json:
   *            schema:
   *              $ref: '#/components/schemas/c_event'
   *      '400':
   *        description: axon.invalidArgument.invalidObjectId or cortex.accessDenied.sessionExpired or cortex.accessDenied.instanceRead
   */
  @log({ traceError: true })
  @route({
    method: 'GET',
    name: 'c_participant_events',
    path: 'c_public_users/:publicUserId/c_events/:eventId?',
    acl: ['account.anonymous']
  })
  static runtimeEventsRoute({ req }) {
    const { publicUserId } = req.params

    if (publicUserId && !isIdFormat(publicUserId)) {
      faults.throw('axon.invalidArgument.invalidObjectId')
    }

    const publicUserCursor = c_public_users.find({ _id: req.params.publicUserId })
      .grant(accessLevels.read)
      .paths('c_account', 'c_events_generating', 'c_future_generation_last_checked_date', 'c_type')
      .passive()
      .skipAcl()
      .grant(accessLevels.read)

    if (!publicUserCursor.hasNext()) {
      faults.throw('axon.invalidArgument.validSubjectRequired')
    }

    const publicUser = publicUserCursor.next()

    // the account was signed-off or session expired
    const isAnonymous = script.principal._id.equals(principals.anonymous)

    // the public user has an account
    const hasAccount = !!publicUser.c_account

    if (isAnonymous && hasAccount) {

      response.setStatusCode(403)

      return {
        object: 'fault',
        name: 'sessions',
        code: 'kSessionExpired',
        errCode: 'cortex.accessDenied.sessionExpired',
        status: 403,
        message: 'Your session has expired.'
      }

    }

    // permissions setup
    // - anonymous if the public user hasn't been registered
    // - administrators for ease of testing or other axon "site" users to list participant events
    // - if the calling principal is the owner of the public user
    const allowedRoles = [
      `${consts.roles.Administrator}`,
      `${consts.roles['Axon Site Auditor']}`,
      `${consts.roles['Axon Site Monitor']}`,
      `${consts.roles['Axon Site User']}`
    ];
    if ((script.principal._id.equals(principals.anonymous) && !publicUser.c_account) ||
        /* eslint-disable-next-line eqeqeq */
        (script.principal.roles.find(v => allowedRoles.some(r => r == v))) ||
        (publicUser.c_account && publicUser.c_account._id.equals(script.principal._id))) {
      const events = AdvanceTaskScheduling.getParticipantEvents(publicUser, req.query, req.params.eventId)
      // adding check for future events
      Scheduler.checkFutureEvents(publicUser)
      return events
    } else {
      faults.throw('cortex.accessDenied.instanceRead')
    }

  }

  @on('c_task_event_missed', { name: 'c_task_event_missed_event' })
  static onMissed({ c_event }) {
    console.log('c_task_event_missed')
    AdvanceTaskScheduling.eventMissed(c_event)
  }

  @on('c_user_tz_updated', { name: 'c_user_tz_updated' })
  static onUserTzUpdated({ c_public_user, initialTzSet }) {
    // do nothing here, this is just a placeholder for the event
  }

  @on('c_update_event_tz', { name: 'c_update_event_tz' })
  static updateEventTimezone({ c_event, c_public_user, initialTzSet }) {
    // do nothing here, this is just a placeholder for the event
  }

  @log({ traceError: true })
  @on('c_create_next_events', { name: 'c_create_next_events' })
  static createNextEvents({ c_generation_event_list, c_public_user }) {
    // do nothing here, this is just a placeholder for the event
  }

  @log({ traceError: true })
  @on('c_continue_partial_generation', { name: 'c_continue_partial_generation' })
  static continuePartialGeneration({ c_partial_generation_record }) {
    // do nothing here, this is just a placeholder for the event
  }

  @on('c_anchor_dates_did_change')
  static anchorDateDidChangeEvent(publicUserId, updatedAnchorDates) {
    // drop message for anchor date update publicUserId, updatedAnchorDates
    console.log('Anchor Did Change')
    logger.debug({
      'anchorDateDidChangeEvent': {
        publicUserId,
        updatedAnchorDates
      }
    })
    AdvanceTaskScheduling.anchorDatesDidChange(publicUserId, updatedAnchorDates)
  }

  @on('c_flags_did_change')
  static flagsDidChangeEvent(publicUserId, updatedFlags) {
    console.log('Flags Did Change')
    logger.debug({
      'flagsDidChangeEvent': {
        publicUserId,
        updatedFlags
      }
    })
    AdvanceTaskScheduling.flagsDidChange(publicUserId, updatedFlags)
  }

  @trigger('create.before', { object: 'c_public_user', weight: 1, principal: 'c_system_user' })
  static publicUserBeforeCreate({ context }) {
    if (context.c_type !== 'caregiver') {
      const schedule_assignments = c_schedule_assignments.find({ c_participant: context._id })
      .skipAcl()
      .grant('read')
      if (schedule_assignments.hasNext()) {
        const { c_set_schedules, _id } = schedule_assignments.next()
        AdvanceTaskScheduling.checkParticipantExists(c_set_schedules, _id)
        return
      }
      const study = Study
        .readOne(context.c_study._id.toString())
        .paths(
          'c_default_participant_schedule',
          'c_use_advanced_task_scheduler'
        )
        .passive()
        .execute()

      if (study && study.c_use_advanced_task_scheduler && study.c_default_participant_schedule) {
        context.push('c_schedule_assignments', {
          c_set_schedules: [study.c_default_participant_schedule._id]
        })
      }
    }
  }


  @trigger('create.after', { object: 'c_public_user', weight: 1, inline: false })
  static publicUserAfterCreateInline() {
    Scheduler.sendMessage({
      subject: 'c_public_user',
      action: 'create.after',
      data: { publicUserId: script.context._id }
    })
    console.log('public user created message sent')
  }

  @trigger('update.after', {
    object: 'c_public_user',
    weight: 1,
    inline: true,
    if: {
      $and: [
        {
          $or: [
            {
              $gte: [{
                $indexOfArray: [
                  '$$SCRIPT.arguments.modified',
                  'c_set_dates'
                ]
              }, 0]
            },
            {
              $gte: [{
                $indexOfArray: [
                  '$$SCRIPT.arguments.modified',
                  'c_set_patient_flags'
                ]
              }, 0]
            }
          ]
        }
      ]
    }
  })
  static publicUserAfterUpdateInline({ old, new: updates, modified, context }) {
    const generateEventTriggers = modified.includes('c_set_dates') || modified.includes('c_set_patient_flags')

    if (generateEventTriggers) {
      logger.debug({
        'publicUserAfterUpdateInline': {
          old: {
            c_set_dates: old.c_set_dates,
            c_set_patient_flags: old.c_set_patient_flags
          },
          new: {
            c_set_dates: updates.c_set_dates,
            c_set_patient_flags: updates.c_set_patient_flags
          },
          publicUserId: context._id
        }
      })
      // Drop message for generateEventsForUser script.context._id
      Scheduler.sendMessage({
        subject: 'c_public_user',
        action: 'update.after',
        data: { publicUserId: script.context._id }
      })
    }

  }

  @trigger('update.after', {
    object: 'c_public_user',
    weight: 1,
    inline: true,
    if: {
      $gte: [{
        $indexOfArray: [
          '$$SCRIPT.arguments.modified',
          'c_tz'
        ]
      }, 0]
    }
  })
  publicUserAfterTZUpdate({ old, new: updates, modified, context }) {
    const initialTzSet = (!old.c_tz || old.c_tz === 'UTC') &&
        (updates.c_tz && updates.c_tz !== 'UTC') &&
        // NOTE: This condition only considers timezones that are UTC-.
        (
          moment.tz(
            moment()
              .toISOString(), updates.c_tz
          )
            .utcOffset() < 0
        )

    const data = {
      publicUserId: context._id,
      initialTzSet
    }
    // drop message for tz update events { c_public_user: old._id, initialTzSet }
    Scheduler.sendMessage({
      subject: 'c_public_user',
      action: 'tzUpdated',
      data
    })
    logger.debug({
      'publicUserAfterTZUpdate': {
        old: old.c_tz,
        new: updates.c_tz,
        publicUserId: context._id,
        initialTzSet
      }
    });
    console.log('timezone update message sent')
  
  }

  @log({ traceError: true })
  @trigger('create.before', {
    object: 'c_task_response',
    weight: 1,
    if: {
      $ne: [
        {
          $pathTo: ['$$ROOT', 'c_event']
        },
        null
      ]
    }
  })
  static taskResponseCreateBefore({ new: newTaskResponse }) {

    const eventCursor = c_events.find({ _id: newTaskResponse.c_event._id })
      .skipAcl()
      .grant(accessLevels.read)

    if (!eventCursor.hasNext()) {
      faults.throw('cortex.invalidArgument.invalidObjectId')
    }

    const event = eventCursor.next()

    if (!event.c_task._id.equals(newTaskResponse.c_task._id)) {
      faults.throw('axon.invalidArgument.eventDoesNotMatchTask')
    }

    const trStartTZ = moment.tz(newTaskResponse.c_start, newTaskResponse.c_tz)

    const eventEndTZ = moment.tz(event.c_end, event.c_timezone)

    let eventStartTZ

    if (event.c_start) {
      eventStartTZ = moment.tz(event.c_start, event.c_timezone)
    }

    if (eventStartTZ && trStartTZ.utc()
      .isBefore(eventStartTZ.utc())) {
      faults.throw('axon.invalidArgument.eventOutsideWindow')
    }

    if (trStartTZ.utc()
      .isAfter(eventEndTZ.utc())) {
      faults.throw('axon.invalidArgument.eventOutsideWindow')
    }

  }

  // Move this entire process to a before to make dependancies inline
  @log({ traceError: true })
  @trigger('update.before', {
    object: 'c_task_response',
    principal: 'c_system_user',
    weight: 1,
    if: {
      $and: [
        {
          $gte: [{
            $indexOfArray: [
              '$$SCRIPT.arguments.modified',
              'c_completed'
            ]
          }, 0]
        },
        {
          $eq: [
            '$$ROOT.c_completed',
            true
          ]
        }
      ]
    }
  })
  static taskResponseComplete({ old, new: updatedTR, modified }) {

    const taskResponse = { ...old, ...updatedTR }
    const eventId = (old.c_event && old.c_event._id) || (updatedTR.c_event && updatedTR.c_event._id)
    if (eventId) {
      // only update if the event isn't already completed
      const evCursor = c_events.find({ _id: eventId, c_completed: false })
        .skipAcl()
        .grant('read')
      if (evCursor
        .hasNext()) {
        let event = evCursor.next()

        if (event.type === 'c_ad_hoc_task_event') {
          event = AdvanceTaskScheduling.cloneEventsForAdhocAssignments(event, taskResponse)
        }

        logger.debug({
          action: 'markEventComplete',
          event: event._id,
          taskResponse: taskResponse._id
        })

        AdvanceTaskScheduling.eventComplete(event._id, taskResponse)
      }
    }

    const publicUserFlagsUpdate = PatientFlagsLib.getFlagsUpdate(taskResponse)
    const publicUserAnchorDateUpdate = AnchorDateLib.getAnchorDateUpdate(taskResponse)

    let publicUserUpdate = publicUserFlagsUpdate

    const anchorDatesUpdated = publicUserAnchorDateUpdate && !!Object.keys(publicUserAnchorDateUpdate).length

    if (anchorDatesUpdated) {
      if (publicUserUpdate.$push) {
        publicUserUpdate.$push = {
          ...publicUserUpdate.$push,
          ...publicUserAnchorDateUpdate.$push
        }
      } else {
        publicUserUpdate = { ...publicUserUpdate, ...publicUserAnchorDateUpdate }
      }
    }

    const isUpdated = publicUserUpdate && !!Object.keys(publicUserUpdate).length

    if (isUpdated) {
      logger.debug({
        action: 'updatePublicUser',
        publicUser: taskResponse.c_public_user._id,
        update: publicUserUpdate,
        taskResponse: taskResponse._id
      })
      c_public_users
        .updateOne({ _id: taskResponse.c_public_user._id }, publicUserUpdate)
        .execute()
    }
  }

  @trigger('update.before', { object: 'c_event', weight: 1 })
  @as('c_system_user', { principal: { skipAcl: true, grant: consts.accessLevels.script }, acl: { safe: false }, modules: { safe: false } })
  static eventUpdatedDate() {
    /* eslint-disable-next-line */
    script.arguments.new.update('c_last_updated', moment().toISOString(), { grant: consts.accessLevels.script })

  }

  // this trigger is only necessary because cortex doesn't allow a parent Doc property to be optional
  // and a sub property being mandatory, in this case only if c_end_date is set we verify if c_anchor_date is specified too
  @log({ traceError: true })
  @trigger('create.before', { object: 'c_task_assignment', principal: 'c_system_user' })
  static taskAssignmentValidation({ new: taskAssignment }) {
    const { c_end_date, c_start_date, type } = taskAssignment

    if (type === 'c_dependent_assignment') {
      if (c_end_date || c_start_date) {
        faults.throw('cortex.invalidArgument.validation')
      }
      return
    }

    // All other types require start date w/ template
    if (!c_start_date || !c_start_date.c_anchor_date_template) {
      faults.throw('cortex.invalidArgument.validation')
    }

    if (typeof c_start_date.c_offset === 'undefined') {
      taskAssignment.update('c_start_date.c_offset', 0)
    }

    if (c_end_date) {
      if (!c_end_date.c_anchor_date_template) {
        faults.throw('cortex.invalidArgument.validation')
      }

      if (typeof c_end_date.c_offset === 'undefined') {
        taskAssignment.update('c_end_date.c_offset', 0)
      }

      const startTemplateId = paths.to(c_start_date, 'c_anchor_date_template._id')
      const endTemplateId = paths.to(c_end_date, 'c_anchor_date_template._id')
      if (String(startTemplateId) === String(endTemplateId)) {
        if (Number(c_start_date.c_offset) > Number(c_end_date.c_offset)) {
          faults.throw('axon.validationError.taskAssignmentStartEndOffset')
        }
      }
    }
  }

  @log({ traceError: true })
  @trigger('delete.before', { object: 'c_participant_schedule', weight: 1, principal: 'c_system_user' })
  static removeTaskAssignmentBeforeDeletingParticipantSchedule({ context }) {
    const participantScheduleCursor = org.objects.c_participant_schedule.find({ _id: context._id })
      .paths('c_task_assignments')
    if (participantScheduleCursor.hasNext()) {
      const participantSchedule = participantScheduleCursor
        .next()
      participantSchedule.c_task_assignments.data.forEach(element => {
        org
          .objects
          .c_task_assignment
          .updateOne({ _id: element._id }, { $pull: { c_participant_schedules: context._id } })
          .skipAcl()
          .grant('script')
          .execute()
      })
    }
  }

  @trigger('err.events.failed')
  handleError({ context, params: { err } }) {
    const message = `Error in Cortex Event: ${context.event} with key: ${context.key}`
    logger.error(message, err)
    console.log(message, err)
  }

}