import { log, on, as } from 'decorators'
import logger from 'logger'
import { Notification, activityNotificationData, getScheduleType, getNotificationParams } from 'ab__notification'
class ActivityMissedTrigger {

  @log({ traceError: true })
  @as('c_system_user', { principal: { skipAcl: true, grant: consts.accessLevels.script }, acl: { safe: false }, modules: { safe: false } })
  @on('c_task_event_missed', { name: 'c_task_event_missed_event_notification', weight: 1 })
  onMissed({ c_event }) {
    const activityNotifications = activityNotificationData()
    const participantActivityMissedNotifications = activityNotifications.activity_missed.filter(notification => notification.activityType === 'Participant')
    const query = this.isSHA256Hash(c_event) ? { c_hash: c_event } : { _id: c_event }
    const event = org.objects.c_events.find(query)
      .expand('c_task', 'c_task_assignment', 'c_task_assignment.c_visit')
      .locale('en_US')
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()[0]
    const publicUserID = event.c_public_user._id

    if (!event) {
      logger.error('Trying to mark event missed but could not find event')
      return
    }

    if (event.c_completed) {
      logger.error('Trying to mark event missed but event is already completed')
      return // Event is not missed
    }

    participantActivityMissedNotifications.forEach(notification => {
      const logContext = `${notification.name}:${notification.encounter}:${notification.activityName}:${notification.scheduleType}:ActivityMissedEvent`
      if (this.matchCriteria(notification, event, logContext)) {
        this.performAction(notification, publicUserID, event, logContext)
      }
    })
  }

  isSHA256Hash(value) {
    const sha256Regex = /^[a-f0-9]{64}$/i
    return sha256Regex.test(value)
  }

  matchCriteria(notification, event, logContext) {
    if (!notification.activityName && !notification.activityKey) {
      logger.error(`[${logContext}] Neither activityName nor activityKey is present`)
      return false
    }

    if (
      (notification.activityKey && notification.activityKey !== event.c_task.c_key.toString()) ||
      (!notification.activityKey && notification.activityName !== event.c_task.c_name.toString())
    ) {
      return false
    }

    if (notification.encounter) {
      const visit = org.objects.c_visit.find({ c_name: notification.encounter }).locale('en_US').toArray()[0]
      if (visit && event.c_task_assignment.c_visit) {
        if (notification.encounter !== event.c_task_assignment.c_visit.c_name.toString()) return false
      }
    }

    const scheduleType = getScheduleType(event.c_task_assignment, logContext)
    if (notification.activityScheduleType !== scheduleType) return false

    return true
  }

  performAction(notification, publicUserID, event, logContext) {
    const params = getNotificationParams(notification, publicUserID, event)
    new Notification(params).schedule(logContext)
    logger.info(`[${logContext}] Notification scheduled successfully`)
  }
}