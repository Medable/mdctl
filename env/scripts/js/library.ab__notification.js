import moment from 'moment.timezone'
const logger = require('logger')
const _ = require('lodash')
import { scheduleNotif, isStudyParticipantUser } from 'cs__notif'
const CAREGIVER = 'caregiver'

const Roles = Object.freeze({
  DATA_REVIEWER: 'data_reviewer',
  PARTICIPANT: 'participant',
  PRINCIPAL_DATA_MANAGER: 'principal_data_manager',
  SITE_USER: 'site_user',
  SITE_INVESTIGATOR: 'site_investigator',
  SITE_MONITOR: 'site_monitor'
})

export class Duration {
  constructor(type, days, hours, minutes) {
    this.type = type
    this.days = days
    this.hours = hours
    this.minutes = minutes
  }
}

export class Frequency {
  constructor(count, interval, unit) {
    this.count = count
    this.interval = interval
    this.unit = unit
  }
}

export class SiteUser {
  constructor(accountID, userID, c_email, c_name) {
    this.accountID = accountID
    this.userID = userID
    this.c_email = c_email
    this.c_name = c_name
  }
}

export class PublicUser {
  constructor(accountID, userID, timezone, site_id, c_email, c_name, c_number, siteNumber) {
    this.accountID = accountID
    this.userID = userID
    this.timezone = timezone
    this.site_id = site_id
    this.c_email = c_email
    this.c_name = c_name
    this.c_number = c_number
    this.siteNumber = siteNumber
  }
}

const siteRecipientTypes = [Roles.SITE_USER, Roles.SITE_INVESTIGATOR, Roles.SITE_MONITOR]

export class Notification {

  constructor(params) {
    logger.info(`Notification:: ${JSON.stringify(params)}`)
    let publicUser
    let siteUsersList
    let notificationPayload = JSON.parse(params.payload || '{}')
    let timezone

    if (params.publicUserID) {
      publicUser = this.getPublicUser(params.publicUserID)
      timezone = publicUser.timezone
      notificationPayload.publicUserEmail = publicUser.c_email
      notificationPayload.publicUserName = publicUser.c_name
      // Add participant ID and site ID to notification payload for all notifications with publicUserID
      notificationPayload.participantNumber = publicUser.c_number
      notificationPayload.siteNumber = publicUser.siteNumber
    }
    if (siteRecipientTypes.includes(params.recipientType)) {
      const siteId = publicUser.site_id
      const site = org.objects.c_site.readOne({_id: siteId}).execute()
      timezone = site.c_tz
      siteUsersList = this.getSiteUsersList(publicUser.site_id, params.recipientType, params.notificationName)
      notificationPayload.siteUserEmail = siteUsersList[0].c_email
      notificationPayload.siteUserName = siteUsersList[0].c_name
      this.c_recipients_list = siteUsersList
    } else if (params.recipientType === 'participant') {
      if (publicUser.accountID) {
        this.c_recipients_list = [publicUser]
      } else {
        this.c_recipients_list = []
      }
      if (this.getCaregiverUsersList(params.publicUserID).length > 0) {
        this.c_recipients_list = this.c_recipients_list.concat(this.getCaregiverUsersList(params.publicUserID))
        this.c_caregiver_client = params.publicUserID
      }
    } else if ([Roles.DATA_REVIEWER, Roles.PRINCIPAL_DATA_MANAGER].includes(params.recipientType)) {
      this.c_recipients_list = this.getDataReviewerAndDataManagerUsers(params.recipientType)
    } else {
      throw new Error(`Invalid recipient type ${params.recipientType} for notification ${params.notificationName}`)
    }
    this.c_name = params.notificationName
    if (params.frequencyType === 'recurring') {
      const frequency = new Frequency(params.frequencyCount, params.frequencyInterval, params.frequencyUnit)
      this.c_recurring = false
      if (frequency.interval > 0) {
        this.c_recurring = true
        this.c_recurrence = {
          c_frequency: frequency.count,
          c_interval: frequency.interval,
          c_unit: frequency.unit
        }
      }
    }
    if (!params.startDate) params.startDate = moment().tz(timezone)
    let eventDate = moment(params.startDate).tz(timezone)
    let triggerDate
    const delay = new Duration(params.delayType || 'absolute', params.delayDays || 0, params.delayHours || 0, params.delayMinutes || 0)
    if (delay.type === 'absolute') {
      triggerDate = moment(eventDate).startOf('day')
      triggerDate.add({ days: delay.days, hours: delay.hours, minutes: delay.minutes })
      if (triggerDate.isBefore(moment().tz(timezone))) {
        triggerDate.add({ days: 1 })
      }
    } else {
      triggerDate = moment(eventDate).add({ days: delay.days, hours: delay.hours, minutes: delay.minutes })
    }
    this.c_date = triggerDate.format()

    this.c_stop_query_condition = params.stopConditions
    this.c_stop_script_condition = params.stopScriptConditions.replace(/\{PARTICIPANT_ID\}/g, params.publicUserID)
    this.c_additional_start_conditions = params.additionalStartConditions || []
    this.c_additional_stop_conditions = params.additionalStopConditions || []
    if (params.event) {
      this.c_cortex_event = params.event
    }

    if (params.taskResponseId) {
      org.objects.c_step_response.find({c_task_response: params.taskResponseId}).expand('c_step').paths('c_step.c_name', 'c_value').forEach(stepResponse => {
        const key = `stepResponse_${stepResponse.c_step.c_name}`.replace(/ /g, "_")
        notificationPayload[key] = stepResponse.c_value
      })
    }

    logger.info(`Notification Payload: ${JSON.stringify(notificationPayload)}`)
    this.c_payload = notificationPayload
    this.c_metadata = params.metadata || null
  }

  schedule(logContext) {
    this.c_recipients_list.forEach((user) => {
      const { c_recipients_list, c_caregiver_client, ...notificationsData } = this
      notificationsData.c_recipient = user.accountID
      const userAccount = org.objects.account.find({_id: user.accountID}).toArray()[0]
      if (this.c_caregiver_client && isStudyParticipantUser(userAccount)) {
        const publicUser = org.objects.c_public_user
          .readOne({ c_account: userAccount._id })
          .paths('c_type')
          .skipAcl()
          .grant(consts.accessLevels.read)
          .execute()
        if (publicUser.c_type === CAREGIVER) {
          notificationsData.c_caregiver_client = this.c_caregiver_client
        }
      }
      logger.info(`[${logContext}] Scheduling notification ${JSON.stringify(notificationsData)}`)
      scheduleNotif(notificationsData)
    })
  }

  getPublicUser(_id) {
    const user = org.objects.c_public_user
      .readOne({ _id })
      .expand('c_site')
      .skipAcl()
      .grant(consts.accessLevels.read)
      .throwNotFound(false)
      .execute()
    const accountId = user.c_account ? user.c_account._id : null
    return new PublicUser(accountId, user._id, user.c_tz, user.c_site._id, user.c_email, user.c_name, user.c_number, user.c_site.c_number)
  }

  isAccountPresent(publicUserId) {
    const account = org.objects.c_public_user.find({_id: publicUserId}).paths('c_account').toArray()[0].c_account
    return account ? true : false
  }

  getDataReviewerAndDataManagerUsers(recipientType) {
    try {
      if (![Roles.DATA_REVIEWER, Roles.PRINCIPAL_DATA_MANAGER].includes(recipientType)) { 
        return [] 
      }
      const rolesMap = {
      [Roles.DATA_REVIEWER]: consts.roles['Data Reviewer'],
      [Roles.PRINCIPAL_DATA_MANAGER]: consts.roles['Principal Data Manager']
      }  
      const users = org.objects.account.find({
      roles: rolesMap[recipientType] 
      })
        .skipAcl()
        .grant(consts.accessLevels.read)
        .toArray()
  
      if (!users || users.length === 0) {
        logger.warn(`No ${recipientRoleName} users found.`)
        return []
      }
      return users.map(user => new SiteUser(user._id, user._id, user.email, user.c_public_identifier))
    } catch (error) {
      logger.error(`Error retrieving ${recipientType} users: ${error.message}`)
      return []
    }
  }
  
  getSiteUsersList(siteId, recipientType, notificationName) {
    if (!recipientType || recipientType === 'participant' || !siteRecipientTypes.includes(recipientType)) {
      logger.error(`Invalid site recipient type ${recipientType} for notification ${notificationName}`)
      throw new Error(`Invalid recipient type ${recipientType} for notification ${notificationName}. ${recipientType} is not a valid site role. Following are the valid site roles: ${siteRecipientTypes.join(', ')}`)
    }

    const roleMap = {
      'site_user': consts.roles['Axon Site User'].toString(),
      'site_investigator': consts.roles['Axon Site Investigator'].toString(),
      'site_monitor': consts.roles['Axon Site Monitor'].toString()
    }

    const siteRole = roleMap[recipientType]

    const accountIds = org.objects.account.find({roles: { $in: [siteRole] } }).toArray().map(item => item._id)

    let siteUsersList = []
    accountIds.forEach((accountId) => {
      const account = org.objects.account.readOne({ _id: accountId })
        .skipAcl()
        .grant(consts.accessLevels.read)
        .throwNotFound(false)
        .execute()

      const currentSiteUser = new SiteUser(account._id, account._id, account.email, account.c_public_identifier)
      siteUsersList.push(currentSiteUser)
    })

    return siteUsersList
  }

  getCaregiverUsersList(publicUserId) {
    const caregiverRelationShip = org.objects.c_public_user.find({_id: publicUserId}).paths('c_caregiver_relationship').toArray()[0].c_caregiver_relationship
    if (!caregiverRelationShip) {
      return []
    }

    const caregiverUserList = []
    org.objects.c_caregiver_relationship.find({_id: caregiverRelationShip._id})
      .paths('c_caregivers_info')
      .toArray()[0]
      .c_caregivers_info
      .filter(ci => ci.c_caregiver_active)
      .filter(ci => this.isAccountPresent(ci.c_public_user._id))
      .forEach(ci => {
        caregiverUserList.push(
          this.getPublicUser(ci.c_public_user._id)
        )
      })

    return caregiverUserList
  }

  template(text, params) {
    const t = _.template(text)
    return t(params)
  }

  toString() {
    return JSON.stringify(this)
  }
}

export function getScheduleType(taskAssignment, logContext) {
  if (taskAssignment.type === 'c_scheduled_assignment') {
    const scheduleType = taskAssignment.c_schedule_rules[0].c_schedule_type
    if (scheduleType === 'once') {
      return 'once'
    } else if (scheduleType === 'rrule') {
      return 'recurring'
    } else {
      logger.error(`[${logContext}]Invalid schedule type: ${scheduleType} for task assignment ${taskAssignment.c_name}`)
    }
  } else if (taskAssignment.type === 'c_ad_hoc_assignment') {
    return 'adhoc'
  } else {
    logger.error(`[${logContext}]Invalid task assignment type: ${taskAssignment.type}`)
  }
}

export function getNotificationParams(notification, publicUserID, event) {
  const params = {}
  params.publicUserID = publicUserID
  params.recipientType = notification.recipientType
  params.notificationName = notification.name
  params.delayType = notification.delayType
  params.delayDays = notification.delay.days
  params.delayHours = notification.delay.hours
  params.delayMinutes = notification.delay.minutes
  params.payload = notification.payload || '{}'
  params.frequencyType = notification.frequencyType
  params.frequencyCount = notification.frequency.count
  params.frequencyInterval = notification.frequency.interval
  params.frequencyUnit = notification.frequency.unit
  params.additionalStartConditions = notification.additionalStartConditions || []
  params.additionalStopConditions = notification.additionalStopConditions || []
  if (event) {
    params.event = event._id
    
    // Build metadata with visit and task c_key/id if available
    const metadata = {}
    if (event.c_task && event.c_task.c_key) {
      metadata.taskCKey = event.c_task.c_key.toString()
    }
    if (event.c_task_assignment && event.c_task_assignment.c_visit && event.c_task_assignment.c_visit.c_key) {
      metadata.visitCKey = event.c_task_assignment.c_visit.c_key.toString()
    }
  }
  if (notification.triggerType === 'activity_reminder') {
    params.startDate = event.c_start
    /*If event is created after actual event start time, send event created time for notifications*/
    if (new Date(event.created).getTime() > new Date(event.c_start).getTime()) {
      params.startDate = event.created
    }
    const stopConditionsArray = notification.stopScriptConditions.split(';')
    additionalStopConditionsActivityReminder(event).forEach(condition => stopConditionsArray.push(condition))
    stopConditionsArray.push(notification.stopScriptConditions)
    params.stopScriptConditions = stopConditionsArray.join(';')
    params.stopConditions = notification.stopConditions
  } else {
    params.stopConditions = notification.stopConditions
    params.stopScriptConditions = notification.stopScriptConditions
  }

  return params
}

function additionalStopConditionsActivityReminder(event) {
  const stopConditionsArray = []
  // Match availability window
  const taskAvailabilityCondition = `return org.objects.c_event.find({_id: '${event._id}', c_completed: false, c_missed: false}).skipAcl().grant(consts.accessLevels.read).count() === 0`
  stopConditionsArray.push(taskAvailabilityCondition)
  return stopConditionsArray
}

export function activityNotificationData() {
  const { objects : { ab__workflow_configuration: ExtConfiguration } } = org
  const { c_data } = ExtConfiguration.readOne({ c_key: 'ab__activity_notifications_data' }).skipAcl().grant('read').execute()
  return c_data || {}
}