import logger from 'logger'

const SENT = 'sent'
export class NotificationStartStopConditions {
  constructor() {
    this.supportedStartConditions = [
      'dont_send_consecutive_day_notifications',
      'dont_send_if_activity_completed',
      'dont_send_after_n_days',
      'dont_send_until_n_days'
    ]
    
    this.supportedStopConditions = [
      'stop_if_activity_completed',
      'stop_after_n_occurrences',
      'stop_on_date'
    ]
  }

  /**
   * Check if a notification should be started based on additional start conditions
   * @param {object} condition - The condition object to check
   * @param {object} notification - The notification object
   * @param {object} context - Additional context (event, publicUser, etc.)
   * @returns {boolean} - true if notification should be started, false if it should be canceled
   */
  checkStartCondition(startCondition, notification, context) {
    if (!startCondition || !startCondition.condition) {
      logger.error(`Invalid start condition object provided for notification ${notification.c_name}`)
      return true
    }

    if (!this.supportedStartConditions.includes(startCondition.condition)) {
      logger.error(`Unsupported start condition: ${startCondition.condition} for notification ${notification.c_name}`)
      return true // Allow notification to proceed if condition is not recognized
    }

    switch (startCondition.condition) {
      case 'dont_send_consecutive_day_notifications':
        return this.checkDontSendConsecutiveDayNotifications(notification, context)
      case 'dont_send_if_activity_completed':
        return this.checkDontSendIfEventCompleted(notification, context)
      case 'dont_send_after_n_days':
        return this.checkDontSendAfterNDays(notification, context, startCondition.value)
      case 'dont_send_until_n_days':
        return this.checkDontSendUntilNDays(notification, context, startCondition.value)
      default:
        return true
    }
  }

  /**
   * Check if a notification should be stopped based on additional stop conditions
   * @param {object} condition - The condition object to check
   * @param {object} notification - The notification object
   * @param {object} context - Additional context (event, publicUser, etc.)
   * @returns {boolean} - true if notification should continue, false if it should be stopped
   */
  checkStopCondition(stopCondition, notification, context) {
    if (!stopCondition || !stopCondition.condition) {
      logger.error(`Invalid stop condition object provided for notification ${notification.c_name}`)
      return true
    }

    if (!this.supportedStopConditions.includes(stopCondition.condition)) {
      logger.error(`Unsupported stop condition: ${stopCondition.condition} for notification ${notification.c_name}`)
      return true // Allow notification to proceed if condition is not recognized
    }

    switch (stopCondition.condition) {
      case 'stop_if_activity_completed':
        return this.checkStopIfEventCompleted(notification, context)
      case 'stop_after_n_occurrences':
        return this.checkStopAfterNOccurrences(notification, context, stopCondition.value)
      case 'stop_on_date':
        return this.checkStopOnDate(notification, context, stopCondition.value)
      default:
        return true
    }
  }

  /**
   * Check if notification should not be sent on consecutive days
   * @param {object} notification - The notification object
   * @param {object} context - Additional context
   * @returns {boolean} - true if notification should be sent
   */
  checkDontSendConsecutiveDayNotifications(notification, context) {
    if (!context.publicUserID) {
      logger.warn('No publicUserID provided for consecutive day check')
      return true
    }

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate())
    const yesterdayEnd = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999)
    const accountId = context.publicUserAccountId
    const recentNotificationSendDates = org.objects.c_notif.find({
      c_recipient: accountId,
      c_name: notification.c_name,
      c_status: SENT
    })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .paths('c_date')
      .toArray()
      .map(n => n.c_date)

    const sentYesterday = recentNotificationSendDates.some(sendDate => {
      const sentDate = new Date(sendDate)
      return sentDate >= yesterdayStart && sentDate <= yesterdayEnd
    })

    if (sentYesterday) {
      logger.info(`Notification ${notification.c_name} not sent due to consecutive day restriction`)
      return false
    }

    return true
  }

  /**
   * Check if notification should not be sent if activity is already completed
   * @param {object} notification - The notification object
   * @param {object} context - Additional context
   * @returns {boolean} - true if notification should be sent
   */
  checkDontSendIfEventCompleted(notification, context) {
    if (!context.event) {
      logger.error(`No event provided in the context: ${JSON.stringify(context)}`)
      return true
    }

    const isEventCompleted = context.event.c_completed

    if (isEventCompleted) {
      logger.info(`Event already completed, not sending notification ${notification.c_name} for recipient: ${notification.c_recipient}`)
      return false
    }

    return true
  }

  /**
   * Check if notification should not be sent after N days from a reference point
   * @param {object} notification - The notification object
   * @param {object} context - Additional context
   * @param {number} days - Number of days after which to stop
   * @returns {boolean} - true if notification should be sent
   */
  checkDontSendAfterNDays(notification, context, days) {
    if (!days || !context.event) {
      logger.warn('No days specified or no event for dont_send_after_n_days check')
      return true
    }

    const eventDate = new Date(context.event.c_start)
    const cutoffDate = new Date(eventDate.getTime() + (days * 24 * 60 * 60 * 1000))
    const now = new Date()

    if (now > cutoffDate) {
      logger.info(`Notification ${notification.c_name} not sent because ${days} days have passed since event start`)
      return false
    }

    return true
  }

  /**
   * Check if notification should not be sent until N days from a reference point
   * @param {object} notification - The notification object
   * @param {object} context - Additional context
   * @param {number} days - Number of days to wait before sending
   * @returns {boolean} - true if notification should be sent
   */
  checkDontSendUntilNDays(notification, context, days) {
    if (!days || !context.event) {
      logger.warn('No days specified or no event for dont_send_until_n_days check')
      return true
    }

    const eventDate = new Date(context.event.c_start)
    const startDate = new Date(eventDate.getTime() + (days * 24 * 60 * 60 * 1000))
    const now = new Date()

    if (now < startDate) {
      logger.info(`Notification ${notification.c_name} not sent because ${days} days have not passed since event start`)
      return false
    }

    return true
  }

  /**
   * Check if notification should be stopped if activity is completed
   * @param {object} notification - The notification object
   * @param {object} context - Additional context
   * @returns {boolean} - true if notification should continue
   */
  checkStopIfEventCompleted(notification, context) {
    if (!context.event) {
      logger.warn(`No event or task provided for stop if activity completed check for notification ${notification.c_name}`)
      return true
    }

    const isEventCompleted = context.event.c_completed
    if (isEventCompleted) {
      logger.info(`Event already completed, not sending notification ${notification.c_name} for recipient: ${notification.c_recipient}`)
      return false
    }

    return true
  }

  /**
   * Check if notification should be stopped after N occurrences
   * @param {object} notification - The notification object
   * @param {object} context - Additional context
   * @param {number} occurrences - Number of occurrences after which to stop
   * @returns {boolean} - true if notification should continue
   */
  checkStopAfterNOccurrences(notification, context, occurrences) {
    if (!occurrences) {
      logger.warn('No occurrences specified for stop_after_n_occurrences check')
      return true
    }

    const accountId = context.publicUserAccountId
    // Count how many times this notification has been sent
    const sentCount = org.objects.c_notif.find({
      _id: notification._id,
      c_recipient: accountId,
      c_status: SENT
    })
    .skipAcl()
    .grant(consts.accessLevels.read)
    .count()

    if (sentCount >= occurrences) {
      logger.info(`Notification ${notification.c_name} stopped because it has been sent ${sentCount} times (limit: ${occurrences})`)
      return false
    }

    return true
  }

  /**
   * Check if notification should be stopped on a specific date
   * @param {object} notification - The notification object
   * @param {object} context - Additional context
   * @param {string} stopDate - Date string when to stop
   * @returns {boolean} - true if notification should continue
   */
  checkStopOnDate(notification, context, stopDate) {
    if (!stopDate) {
      logger.warn('No stop date specified for stop_on_date check')
      return true
    }

    const stopDateTime = new Date(stopDate)
    const now = new Date()

    if (now >= stopDateTime) {
      logger.info(`Notification ${notification.c_name} stopped because stop date ${stopDate} has been reached`)
      return false
    }

    return true
  }

  /**
   * Check all additional start conditions for a notification
   * @param {object} notification - The notification object
   * @param {object} context - Additional context
   * @returns {object} - { shouldStart: boolean, reason: string }
   */
  checkAllStartConditions(notification, context) {
    if (!notification.c_additional_start_conditions || !Array.isArray(notification.c_additional_start_conditions)) {
      return { shouldStart: true, reason: null }
    }

    for (const startCondition of notification.c_additional_start_conditions) {
      const shouldStart = this.checkStartCondition(startCondition, notification, context)
      if (!shouldStart) {
        return { 
          shouldStart: false, 
          reason: `Start condition failed: ${startCondition.condition}`
        }
      }
    }

    return {
      shouldStart: true,
      reason: null
    }
  }

  /**
   * Check all additional stop conditions for a notification
   * @param {object} notification - The notification object
   * @param {object} context - Additional context
   * @returns {object} - { shouldContinue: boolean, reason: string }
   */
  checkAllStopConditions(notification, context) {
    if (!notification.c_additional_stop_conditions || !Array.isArray(notification.c_additional_stop_conditions)) {
      return { shouldContinue: true, reason: null }
    }

    for (const stopCondition of notification.c_additional_stop_conditions) {
      const shouldContinue = this.checkStopCondition(stopCondition, notification, context)
      if (!shouldContinue) {
        return { 
          shouldContinue: false, 
          reason: `Stop condition met: ${stopCondition.condition}`
        }
      }
    }

    return {
      shouldContinue: true,
      reason: null
    }
  }
}