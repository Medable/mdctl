import _ from 'lodash'
import faults from 'c_fault_lib'
import logger from 'logger'
import moment from 'moment.timezone';
import { isIdFormat } from 'util.id'
import { trigger, as, log } from 'decorators'
import { paths } from 'util'
import AtsNotifManager from 'c_ats_notif_manager'
import Scheduler from 'scheduler__library'

const {
  c_public_users,
  c_events,
  c_tasks,
  Events,
  c_task_responses,
  c_participant_schedules,
  c_schedule_assignments,
  c_caregiver_relationship
} = org.objects

const { accessLevels } = consts

export class AdvanceTaskScheduling {

  static regenerateEvents(publicUserIds = [], taskAssignmentsIds = []) {
    for (const publicUserId of publicUserIds) {
      Scheduler.sendMessage({subject: 'c_public_user', action: 'regenerate', data: { publicUserId, taskAssignmentsIds } })
    }
  }

  static flagsDidChange(publicUserId, updatedFlags) {

    org.objects.c_generation_trigger.insertOne({
      c_public_user: publicUserId,
      c_type: 'flag'
    })
      .bypassCreateAcl()
      .execute()
  }


  @as('c_system_user', { principal: { skipAcl: true, grant: consts.accessLevels.read }, acl: { safe: false }, modules: { safe: false } })
  static getParticipantTaskIds(publicUserId) {
    const publicUser = c_public_users.find({ _id: publicUserId })
      .paths('c_schedule_assignments.c_participant_schedules.c_task_assignments.c_task._id', 'c_schedule_assignments.c_task_assignments.c_task._id', 'c_type')
      .passive()
      .next()

    // const userAssignments = this.getUserAssignments(publicUser, false)
    const userIds = [publicUserId]
    let users = [publicUser] 

    if(publicUser.c_type === 'caregiver') {
      let relationships = org.objects.c_caregiver_relationships.find({ $or: [{ c_client: publicUserId }, { c_caregiver_assignments: publicUserId }] })
      .expand(['c_client', 'c_caregivers']).toArray()

      userIds.push(...relationships.map(v => v.c_client._id))

      users =  c_public_users.find({ _id: { $in: userIds } })
      .paths('c_schedule_assignments.c_participant_schedules.c_task_assignments.c_task._id', 'c_schedule_assignments.c_task_assignments.c_task._id', 'c_type')
      .toArray()

    }

    const userAssignments = users.reduce((assignments, user) => {
      assignments.push(...this.getUserAssignments(user, false))
      return assignments
    }, [])

    return userAssignments.map(({ c_task }) => c_task._id)
  }

  static anchorDatesDidChange(publicUserId, updatedAnchorDates) {
    const updatedAssignments = org.objects.c_task_assignments.find({
      $or: [
        { 'c_start_date.c_anchor_date_template': { $in: updatedAnchorDates } },
        { 'c_end_date.c_anchor_date_template': { $in: updatedAnchorDates } }
      ]
    })
      .skipAcl()
      .grant('read')
      .paths('_id')
      .map(v => v._id)

    // This object performs 2 purposes
    // it allows regenerations to be queued
    // it helps the `as-needed` regeneration process so we know that an anchor date may
    // have changed the events of an assignments we generated previously
    org.objects.c_generation_trigger.insertOne({
      c_public_user: publicUserId,
      c_type: 'anchor-date',
      c_updated_assignments: updatedAssignments
    })
      .bypassCreateAcl()
      .execute()

  }


  // Ensures a missed event check exists for the given event.
  static updateMissedEventCheck(c_event) {
    const event = Events.readOne({
      $or: [
        { key: `missed-event-${c_event.c_hash}` },
        { key: `missed-event-${c_event._id.toString()}` }
      ]
    })
      .skipAcl()
      .grant(accessLevels.read)
      .throwNotFound(false)
      .execute()

    if (!event) {
      return this.addMissedEventCheck(c_event)
    }

    return Events.updateOne(event._id, { $set: { start: c_event.c_end } })
      .skipAcl()
      .grant(accessLevels.update)
      .execute()
  }

  // Removes any scheduled missed event check for an eventId.
  static removeMissedEventCheck(eventId) {
    Events.deleteMany({ key: `missed-event-${eventId}` })
      .skipAcl()
      .grant(consts.accessLevels.delete)
      .execute()
  }

  // Schedules a missed check for an event, if necessary.
  static addMissedEventCheck(c_event) {
    if (c_event.type === 'c_ad_hoc_task_event') {
      return
    }
    if (c_event.type === 'c_dependent_task_event' && !c_event.c_all_dependencies_met) {
      return
    }

    // if an event of this type already exists the creation will fail silently
    try {
      Events.insertOne({
        type: 'script',
        key: `missed-event-${c_event.c_hash.toString()}`,
        event: 'c_task_event_missed',
        param: {
          c_event: c_event.c_hash
        },
        start: c_event.c_end
      })
        .grant('update')
        .bypassCreateAcl()
        .execute()

    } catch (err) {

    }
  }

  static getUserAssignments(publicUser, applyFlagsFilter = true) {

    // const { c_schedule_assignments: { data: scheduleAssignments } } = publicUser
    const scheduleAssignments = publicUser && publicUser.c_schedule_assignments && publicUser.c_schedule_assignments.data

    if(!scheduleAssignments) {
      return []
    }

    let userAssignments = scheduleAssignments
      // obtain assignments from taskAssignments and participantSchedules
      .reduce((a, scheduleAssignment) => {

        const {
          c_task_assignments: { data: taskAssignments },
          c_participant_schedules: { data: participantSchedules }
        } = scheduleAssignment

        taskAssignments.forEach(taskAssignment => {

          a.push(taskAssignment)

        })

        participantSchedules.forEach(partSched => {

          const { c_task_assignments: { data: taskAssignments } } = partSched

          taskAssignments.forEach(taskAssignment => {

            a.push(taskAssignment)

          })

        })

        return a

      }, [])
      // remove duplicates if any
      .reduce((acc, taskAssignment) => {

        const isFound = acc.find(accTaskAssignment => accTaskAssignment._id.equals(taskAssignment._id))

        if (isFound) return acc

        acc.push(taskAssignment)

        return acc

      }, [])

    if (applyFlagsFilter) {

      userAssignments = userAssignments
      // filter out assignments that are not available considering user flags
        .filter(taskAssignment => {
          return this.checkAssignmentFlagAvailability(taskAssignment, publicUser)
        })
    }

    return userAssignments

  }

  @log({ traceError: true })
  static checkAssignmentFlagAvailability(taskAssignment, publicUser) {
    const { c_assignment_availability: assignmentAvailability } = taskAssignment
    const { c_set_patient_flags: patientFlags } = publicUser
    // If the deactivation flag is set on the c_public_user.c_set_patient_flags, we consider all assignments as not available
    const deactivatedFlag = patientFlags && patientFlags.find(flag => flag.c_identifier === 'c_axon_participant_deactivated')
    if (deactivatedFlag && deactivatedFlag.c_enabled) {
      return false
    }
    // if there are no conditions we assume the assigment is always present
    if (!assignmentAvailability || assignmentAvailability.length === 0) return true

    const isAvailable = assignmentAvailability
      .reduce((acc, assignmentCondition) => {

        const { c_flag: { _id: flagId }, c_flag_value: expectedFlagValue } = assignmentCondition
        const patientFlagSet = patientFlags && patientFlags.find(({ c_flag: patientFlagRef }) => patientFlagRef._id.toString() === flagId.toString())
        if (!patientFlagSet) return acc && !expectedFlagValue
        return acc && (patientFlagSet.c_enabled === expectedFlagValue)

      }, true)

    return isAvailable

  }



  @as('c_system_user', { principal: { skipAcl: true, grant: consts.accessLevels.read }, acl: { safe: false }, modules: { safe: false } })
  static getParticipantTaskDefinitions(pu_id, query = {}, taskId) {
    let { where, sort, limit, skip } = query

    if (where) {
      where = JSON.parse(where)
    }

    if (sort) {
      sort = JSON.parse(sort)
    }

    let taskList = this.getParticipantTaskIds(pu_id)
    
    if (taskId) {
      if (taskList.find(v => v.equals(taskId))) {
        taskList = [taskId]
      } else {
        // request task not available to user
        faults.throw('axon.accessDenied.taskNotAvailable')
      }
    }

    let taskCursor = c_tasks.find()
      .where({
        ...where,
        ...{
          _id: { $in: taskList }
        }
      })

    if (sort) {
      taskCursor = taskCursor.sort(sort)
    }

    if (limit) {
      taskCursor = taskCursor.limit(limit)
    }

    if (skip) {
      taskCursor = taskCursor.skip(skip)
    }

    taskCursor.expand('c_steps', 'c_branches')

    if (taskId) {
      return taskCursor.next()
    } else {
      return taskCursor
    }

  }

  @as('c_system_user', { acl: { safe: false }, modules: { safe: false } })
  static getParticipantEvents(publicUser, query = {}, eventId) {

    if (publicUser.c_events_generating) {
      return {
        data: [],
        generating: true,
        object: 'list',
        hasMore: false
      }
    }
    let { where, sort, limit, paths } = query

    if (where) {
      where = JSON.parse(where)
    }

    const eventsCursor = c_events.find()

    // TODO: FIX THIS SHITE
    where = {
      ...where
    }

    if(publicUser.c_type === 'caregiver' && !where.c_public_user) {
      const clients =  c_caregiver_relationship.find( { c_caregiver_assignments:  publicUser._id }).toArray().map(v => v.c_client._id)
      const userList =  [publicUser._id, ...clients]
      where.c_public_user = { $in: userList }
    } else {
      where.c_public_user = publicUser._id
    }

    if (sort) {
      sort = JSON.parse(sort)
      eventsCursor.sort(sort)
    }

    if (limit) {
      eventsCursor.limit(limit)
    }

    if (paths) {

      const filteredPaths = paths
        .filter(path => {

          const [prop, ...rest] = path.split('.')

          if (rest.length <= 1) return true

          // means it tries to access deeper than 1 level from the event
          // these are the allowed configurations
          const allowedExpansions = {
            c_task_response: [
              'c_task.c_name'
            ]
          }

          const allowedSubProps = allowedExpansions[prop]

          if (!allowedSubProps) return false

          const restInPathForm = rest.join('.')

          return allowedSubProps.includes(restInPathForm)
        })

      eventsCursor.paths(filteredPaths)

    }

    if (eventId) {
      where._id = eventId
    }

    eventsCursor.where(where)

    if(publicUser.c_type !== 'caregiver') {
      if (eventId) return eventsCursor.next()

      return eventsCursor
        .expand('c_task_response')
        .passive()

    } else {
      return script.as(script.principal._id,  { safe: false, principal: { skipAcl: true, grant: consts.accessLevels.read } }, () => {
        if (eventId) return eventsCursor.next()

          return eventsCursor
            .expand('c_task_response')
            .passive()
      })
    }
  }


  @log({ traceError: true })
  static eventComplete(_id, taskResponse) {
    let completionTime = moment()
          .toISOString(),
        outcome = 'complete'
    const update = { c_completed: true, c_missed: false }

    if (taskResponse) {
      // Not all events are associated with a task response, e.g. authentication
      completionTime = taskResponse.c_end
      outcome = taskResponse.c_success ? 'complete:success' : 'complete:failure'
      update.c_task_response = taskResponse._id
    }

    this.removeMissedEventCheck(_id)

    const { c_missed: alreadyMissed } = c_events.find({ _id })
      .paths('c_missed')
      .next()

    const event = c_events.updateOne({ _id }, { $set: update })
      .skipAcl()
      .grant(accessLevels.update)
      .lean(false)
      .execute()

    this.manageDependencies(event, outcome, completionTime, alreadyMissed)
  }

  @log({ traceError: true })
  static manageDependencies(event, outcome, eventTime, alreadyMissed = false) {
    const dependentEvents = c_events.find({
      c_public_user: event.c_public_user._id,
      $or: [
        {'c_dependencies.c_parent_event': event._id},
        {'c_dependencies.c_parent_hash': event.c_hash}
      ],
      type: 'c_dependent_task_event'
    })
      .paths('c_dependencies')
      .skipAcl()
      .grant(accessLevels.read)
      .passive()
      .toArray()

    console.log(`Checking ${dependentEvents.length} dependencies for event ${event._id}`)
    dependentEvents.forEach(ev => {
      const dependency = ev.c_dependencies.find(v => (v.c_parent_event && v.c_parent_event._id.equals(event._id)) || v.c_parent_hash === event.c_hash)
      let update = null

      if (dependency.c_type === outcome || (dependency.c_type === 'complete' && ['complete:success', 'complete:failure'].includes(outcome))) {
        console.log(`Dependency met for ${ev._id}, updating.`)
        ev = c_events.updateOne({ _id: ev._id }, { $set: { c_dependencies: [{ _id: dependency._id, c_dependency_met: true }] } })
          .skipAcl()
          .grant(accessLevels.update)
          .lean(false)
          .execute()

        const c_all_dependencies_met = ev.c_dependencies.every(v => v.c_dependency_met)

        if (c_all_dependencies_met) {
          console.log(`All Dependencies met for ${ev._id}, updating.`)
          const c_start = moment(eventTime)
            .add(ev.c_parent_offset_time, 'minutes')
            .toISOString()

          const c_end = moment(c_start)
            .add(ev.c_duration, 'minutes')
            .toISOString()
          update = {
            c_start,
            c_end,
            c_all_dependencies_met
          }

        }
      } else if (alreadyMissed && ['complete', 'complete:success', 'complete:failure'].includes(outcome)) {
        ev = c_events.updateOne({ _id: ev._id }, { $set: { c_dependencies: [{ _id: dependency._id, c_dependency_met: false }] } })
          .skipAcl()
          .grant(accessLevels.update)
          .lean(false)
          .execute()
        update = {
          c_all_dependencies_met: false
        }
      }

      if (update) {
        const updatedEvent = c_events.updateOne({ _id: ev._id }, { $set: update })
          .skipAcl()
          .grant(accessLevels.update)
          .lean(false)
          .execute()

        // Recalculate Event Notifications
        const eventNotifs = new AtsNotifManager()
        eventNotifs.updateNotifEventTimezone(updatedEvent)
        this.addMissedEventCheck(updatedEvent)
      }

    })

  }

  // if an event is not complete, mark it as missed.
  static eventMissed(hash) {
    const findWhere = isIdFormat(hash) ? {_id: hash} : {c_hash: hash}
    let [event] = c_events.find(findWhere)
      .skipAcl()
      .grant(accessLevels.read)

    if (!event) {
      // If this happens, it's because we failed to clean up after ourselves.
      logger.error('Trying to mark event missed but could not find event')
      return
    }

    if (event.c_completed) {
      return // Event is not missed
    }

    const missedTime = event.c_end
    event = c_events.updateOne({ _id: event._id }, { $set: { c_completed: false, c_missed: true } })
      .skipAcl()
      .grant(accessLevels.update)
      .lean(false)
      .execute()

    this.manageDependencies(event, 'missed', missedTime)
  }

  // this clones a given dependent event and points its dependencies to the specfied ad-hoc event
  static cloneDependentEventForAdHocEvent(dependentEvent, newEvent) {

    // array of props that should not be written manually but by a trigger
    const propsWrittenByScript = ['c_last_updated']

    const customKeys = Object
      .keys(dependentEvent)
      .filter(key => key.startsWith('c_') || key === 'type')
      .filter(key => !propsWrittenByScript.includes(key))
      

    const dependentEventClone = customKeys
      .reduce((acc, curr) => {

        // we need to clone c_dependencies differently
        // because it is an array and we need to modify the
        // c_parent_event to point to the new event id
        if (curr === 'c_dependencies') {

          const dependencies = dependentEvent[curr]

          const newDependencies = dependencies
          // I don't think there will ever be a dependency met true at this point
          // but looks more correct to filter them just in case
            .filter(({ c_dependency_met }) => c_dependency_met === false)
            .map(({ c_dependency_met, c_type }) => {
              return {
                c_dependency_met,
                c_type,
                // map to the new event id
                c_parent_event: newEvent._id,
                c_parent_hash: newEvent.c_hash
              }
            })

          return { ...acc, [curr]: newDependencies }

        } else if(curr === 'c_hash') {
            const taskResponseId = newEvent.c_hash.split('-')[1]
            return { ...acc, [curr]: `${dependentEvent[curr]}-${taskResponseId}` }
        }

        // if it is a reference assign  the id otherwise the primitive  value
        // we use paths.to because there is one of the props that comes in null
        const value = paths.to(dependentEvent[curr], '_id') || dependentEvent[curr]

        return { ...acc, [curr]: value }

      }, {})

    return dependentEventClone
  }

  static cloneEventsForAdhocAssignments(event, taskResponse) {

    const newEventBody = {
      type: event.type,
      c_start: event.c_start,
      c_end: event.c_end,
      c_task: event.c_task._id,
      c_public_user: event.c_public_user._id,
      c_task_assignment: event.c_task_assignment._id,
      c_auto_start: !!event.c_auto_start,
      c_timezone: event.c_timezone,
      c_hash: event.c_hash + `-${taskResponse._id}`,
      c_completed: false,
      c_missed: false
    }

    const newEvent = c_events.insertOne(newEventBody)
      .bypassCreateAcl()
      .grant(accessLevels.delete)
      .lean(false)
      .execute()

    // get dependent events for the original ad hoc event
    const dependentEvents = c_events
      .find({
        c_public_user: event.c_public_user._id,
        $or: [
          {'c_dependencies.c_parent_event': event._id},
          {'c_dependencies.c_parent_hash': event.c_hash}
        ],
        c_completed: false,
        type: 'c_dependent_task_event'
      })
      .skipAcl()
      .grant(accessLevels.read)
    // using map to push the logic to Cortex
      .map(dependentEvent => this.cloneDependentEventForAdHocEvent(dependentEvent, newEvent))

    if (dependentEvents.length) {

      const { writeErrors } = c_events
        .insertMany(dependentEvents)
        .skipAcl()
        .grant(accessLevels.delete)
        .execute()

      // we don't throw the errors because we don't want
      // to interrupt the task response creation
      if (writeErrors.length) {
        console.error(writeErrors)
      }

    }

    c_task_responses.updateOne({ _id: taskResponse._id }, { $set: { c_event: newEvent._id } })
      .execute()

    return newEvent

  }

  static checkParticipantExists(c_set_schedules, schedule_id) {
    c_set_schedules.forEach(element => {
      const participant_schedule = c_participant_schedules.find({ _id: element })
        .skipAcl()
        .grant('read')
      if (!participant_schedule.hasNext()) {
        c_schedule_assignments.updateOne(
          { _id: schedule_id },
          { $pull: { c_set_schedules: element } }
        )
          .execute()
      }
    })
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

}