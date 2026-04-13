/***********************************************************
========================================
WARNING: DO NOT MODIFY THIS FILE
========================================

@fileoverview This file is part of deprecated ATS configuration and should not be altered.
Any changes made to this file may be overwritten by scheduler-package.
Modifications to ATS functionality should be implemented in scheduler-package.

Scheduler-package repo: https://gitlab.medable.com/axon/scheduler-package

@script     ATS Notification Manager

@brief      c_ats_notif_manager

@author     Armando Fernandez & Ian Logan

@description This library is intended to be used to manage AXON ATS notifications, both task assignment notifications & compliance notifications.

(c)2016-2020 Medable, Inc.  All Rights Reserved.
Unauthorized use, modification, or reproduction is prohibited.
This is a component of Axon, Medable's SmartStudy(TM) system.

***********************************************************/
import notifGenerator from 'c_axon_notif_generator'
import moment from 'moment.timezone'
import logger from 'logger'
const { on } = require('decorators')

class TaskAssignmentNotif {

  constructor(c_event, c_task_assignment, notif) {
    this.c_event = c_event._id
    this.c_public_user = c_event.c_public_user._id
    this.c_task_assignment = c_task_assignment._id
    this.c_notification_name = notif.c_notification_name // previously c_template_name
    this.c_recipients = this.getAccountID(c_event.c_public_user._id)
    this.c_conditional = notif.c_conditions
    this.c_date = TaskAssignmentNotif.calculateSendDate(c_event, notif)
    this.c_status = 'scheduled'
    this.c_payload = '{}'
    this.c_iteration = 1
    this.c_recurring = false
    this.c_tz = this.getPublicUser(c_event.c_public_user._id).c_tz || 'Etc/GMT'
    this.type = 'c_axon_event_notif'
  }

  getTaskAssignmentNotifications() {
    const { c_task_assignment: taskAssignments } = org.objects,
          taskAssignment = taskAssignments.readOne({ _id: this.c_task_assignment._id })
            .throwNotFound(false)
            .skipAcl()
            .grant(consts.accessLevels.read)
            .execute()
    return (taskAssignment && taskAssignment.c_notifications) || null
  }

  /**
   * Calculates send date for a c_axon_notification
   * the send date is offset (in minutes) from either the start or end of the associated event
   * @param {Object} c_event an instance of a c_event object
   * @param {Object} notif blueprint for specific notif on a c_task_assignment (NOT c_axon_notif object)
   * @returns {Date} date that the notif should send (as ISOString)
   */
  static calculateSendDate(c_event, notif) {
    const REFERENCE = { START: 'start', END: 'end' },
          offset = notif.c_offset || 0,
          referenceTime = notif.c_reference_time

    if (referenceTime === REFERENCE.START) {
      const sendDate = moment(c_event.c_start)
        .add(offset, 'minutes')
        .toISOString()
      return sendDate
    } else if (referenceTime === REFERENCE.END) {
      const sendDate = moment(c_event.c_end)
        .add(offset, 'minutes')
        .toISOString()
      return sendDate
    }
  }

  getAccountID(publicUserID) {
    const { c_account } = this.getPublicUser(publicUserID)
    return (c_account && c_account._id) || null
  }

  getPublicUser(publicUserID) {
    const pUser = org.objects.c_public_users.readOne({ _id: publicUserID })
      .throwNotFound(false)
      .skipAcl()
      .grant(consts.accessLevels.read)
      .execute()
    return pUser || {}
  }

}

export default class ATSNotifManager {

  constructor() {
    this.NOTIF_TYPES = {
      TASK_ASSIGNMENT: 'c_ats_notif',
      COMPLIANCE: 'c_compliance_notif'
    }
  }

  // main code that runs in 'library.c_axon_adv_task_scheduler_runtimes.js'
  // checks to see if task assignment has any notifs, then schedules them based on incoming c_event
  createAxonNotifs(c_event) {
    const { c_task_assignment: TaskAssignments } = org.objects,
          READ = consts.accessLevels.read,
          taskAssignment = TaskAssignments.readOne({
            _id: c_event.c_task_assignment._id
          })
            .throwNotFound(false)
            .skipAcl()
            .grant(READ)
            .execute()

    if (taskAssignment) {
      this.insertTaskAssignmentNotifs(c_event, taskAssignment)

      // Schedule Compliance Axon Notifs
      // TODO this.insertComplianceNotifs(c_event, taskAssignment)
    }
  }

  insertTaskAssignmentNotifs(event, taskAssignment) {
    if (taskAssignment.c_notifications) {
      taskAssignment.c_notifications.forEach((taNotif) => {
        ATSNotifManager.insertSingleTaskAssignmentNotif(
          event,
          taskAssignment,
          taNotif
        )
      })
    }
  }

  /**
   * Inserts the two database objects that make up a notification
   * 1) c_axon_notif - contains the metadata for a notification associated with a specific c_event
   * 2) Cortex Event of the notification type - responsible for actually firing the notification during a c_event
   * @param {Object} event c_event to associate with axon notif
   * @param {Object} taskAssignment task assignment to associate with axon notif
   * @param {Object} taNotif blueprint for specific notif on a c_task_assignment
   */
  static insertSingleTaskAssignmentNotif(event, taskAssignment, taNotif) {
    taNotif.c_conditions =
      taNotif.c_conditions || this.NOTIF_TYPES.TASK_ASSIGNMENT
    const taskAssignmentNotif = new TaskAssignmentNotif(
      event,
      taskAssignment,
      taNotif
    )

    if (!taskAssignmentNotif.c_recipients) {
      logger.info(
        'ATS Notif Creation skipped as taskAssignmentNotif.c_recipients is empty',
        { taskAssignmentNotif }
      )
      return
    }

    // Insert ATS Task Assignment Notification.
    const notifID = org.objects.c_axon_notifs
      .insertOne(taskAssignmentNotif)
      .skipAcl()
      .grant(consts.accessLevels.update)
      .bypassCreateAcl()
      .execute()

    logger.info(`ATS Notif Created:  ${JSON.stringify(notifID)}`)

    notifGenerator.insertCortexEvent(
      taNotif.c_conditions, // Event name
      `${notifID}|0`, // key
      { c_axon_notif: notifID }, // params
      taskAssignmentNotif.c_date
    ) // time to fire Event
  }

  /**
   * Takes an event and looks up associated c_axon_notifs
   * If event has notifications - update them with appropriate timezone information
   * - note - 'sent' notifications are ignored
   * @param {Object} event the c_event to query axon notifs by
   */
  updateNotifEventTimezone(event) {
    // skip if c_event doesn't have any notifications
    const axonNotifs = org.objects.c_axon_notif
      .find({ c_event: event._id })
      .skipAcl()
      .grant('read')
    if (!axonNotifs.hasNext()) {
      return
    }

    while (axonNotifs.hasNext()) {
      const currAxonNotif = axonNotifs.next(),
            // we need to query the task assignment for the offset and reference time of current notif
            taskAssignment = org.objects.c_task_assignment
              .readOne({ _id: currAxonNotif.c_task_assignment._id })
              .skipAcl()
              .grant('read')
              .execute(),
            taNotif = taskAssignment.c_notifications.find(
              (notif) =>
                notif.c_notification_name === currAxonNotif.c_notification_name
            )

      // reschedule notifs that haven't already sent
      if (currAxonNotif.c_status !== 'sent') {
        const sendDate = TaskAssignmentNotif.calculateSendDate(event, taNotif)

        // update the axon notif (for accurate metadata)
        const axonNotifUpdates = {
          c_tz: event.c_timezone,
          c_date: sendDate
        }
        org.objects.c_axon_notif
          .updateOne(
            { _id: currAxonNotif._id },
            {
              $set: axonNotifUpdates
            }
          )
          .skipAcl()
          .grant('update')
          .execute()

        // update the Cortex event with the new start time (responsible for the actual notification firing)
        const notifCortexEventUpdates = {
          start: sendDate
        }
        const notifEvent = org.objects.Events
          .find({ key: `${currAxonNotif._id}|0` })
          .skipAcl()
          .grant(consts.accessLevels.read)
        if (!notifEvent.hasNext()) {
          notifGenerator.insertCortexEvent(
            currAxonNotif.c_conditional, // Event name
            `${currAxonNotif._id}|0`, // key
            { c_axon_notif: currAxonNotif._id }, // params
            sendDate // time to fire Event
          )
        } else {
          org.objects.Events.updateOne(
            { key: `${currAxonNotif._id}|0` },
            {
              $set: notifCortexEventUpdates
            }
          )
            .skipAcl()
            .grant('update')
            .execute()
        }
      }
    }
  }

  // The notification will be sent unless the task was completed or the event was cleared.
  @on('c_ats_notif', { name: 'c_ats_notif' })
  static atsNotif({ c_axon_notif }) {
    const notif = org.objects.c_axon_notif
            .readOne({ _id: c_axon_notif.toString() })
            .skipAcl()
            .grant(consts.accessLevels.read)
            .execute(),
          event = org.objects.c_event
            .readOne({ _id: notif.c_event._id })
            .throwNotFound(false)
            .skipAcl()
            .grant(consts.accessLevels.read)
            .execute(),
          context = 'c_axon_notif'

    if (event) {
      // @todo: dependent task notifications should not be sent until all dependencies of dependent task assignment are met
      if (event.type !== 'c_dependent_task_event' || event.c_all_dependencies_met === true) {
        if (!event.c_completed) {
          notifGenerator.sendNotif(notif, context)
        } else {
          notifGenerator.setStatus(
            notif._id,
            'canceled',
            'Task completed',
            context
          )
        }
      }
    } else {
      // Events can be removed (c_event_clearing_transform)
      notifGenerator.setStatus(
        notif._id,
        'canceled',
        'Event was removed by c_event_clearing_transform',
        context
      )
    }
  }

  // The notification will be sent regardless of whether the task was completed or the event was cleared.
  @on('c_default', { name: 'c_default' })
  static defaultNotif({ c_axon_notif }) {
    const notif = org.objects.c_axon_notif
            .readOne({ _id: c_axon_notif.toString() })
            .skipAcl()
            .grant(consts.accessLevels.read)
            .execute(),
          event = org.objects.c_event
            .readOne({ _id: notif.c_event._id })
            .throwNotFound(false)
            .skipAcl()
            .grant(consts.accessLevels.read)
            .execute()
    if (event.type !== 'c_dependent_task_event' || event.c_all_dependencies_met === true) {
      notifGenerator.sendNotif(notif)
    }

  }

}