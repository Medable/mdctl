import { log, on, as } from 'decorators'
import logger from 'logger'
import { Notification, activityNotificationData, getScheduleType, getNotificationParams } from 'ab__notification'
class ActivityReminderTrigger {

  @log({ traceError: true })
  @as('c_system_user', { principal: { skipAcl: true, grant: consts.accessLevels.script }, acl: { safe: false }, modules: { safe: false } })
  @on('c_task_event_created', { name: 'c_task_event_created_notification' })
  onEventCreated({ c_event }) {
    const activityNotifications = activityNotificationData()
    const participantActivityReminderNotifications = activityNotifications.activity_reminder.filter(notification => notification.activityType === 'Participant')
    const event = org.objects.c_events.find({ c_hash: c_event })
      .expand('c_task', 'c_task_assignment', 'c_task_assignment.c_visit')
      .locale('en_US')
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()[0]
    const publicUserID = event.c_public_user._id

    participantActivityReminderNotifications.forEach(notification => {
      const logContext = `${notification.name}:${notification.encounter}:${notification.activityName}:${notification.scheduleType}:ActivityReminderEvent`
      if (this.matchCriteria(notification, event, logContext)) {
        this.performAction(notification, publicUserID, event, logContext)
      }
    })      
  }

  matchCriteria(notification, event, logContext) {
    if (event.c_completed || event.c_missed) return false

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