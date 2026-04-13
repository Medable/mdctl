const { send } = require('notifications'),
      moment = require('moment.timezone'),
      { on, log, trigger } = require('decorators')

export default class NotificationGenerator {

  static notifType = 'c_default'

  static statusList = ['scheduled', 'sent', 'canceled', 'skipped']

  static sendNotif(notif, document = 'c_axon_notif') {
    const payload = notif.c_payload ? JSON.parse(notif.c_payload) : {},
          recipient = notif.c_recipients._id,
          { locale } = org.objects.account.readOne({ _id: recipient })
            .paths('locale')
            .skipAcl()
            .grant(consts.accessLevels.read)
            .execute()

    send(notif.c_notification_name, { payload }, { recipient, locale })
    this.setStatus(notif._id, 'sent', null, document)

    this.createSentRecord(notif.c_public_user._id, notif._id, document)
    this.rescheduleNotif(notif)
  }

  static rescheduleNotif(notif) {
    if (notif.c_recurring) {
      const date = moment(notif.c_date)
        .add(notif.c_interval, notif.c_unit)
        .format()
      this.insertCortexEvent(notif.c_conditional, `${notif._id}|resched_${date}`, { c_axon_notif: notif._id }, date)
      // do i only want to reschedule the cortex event?  this will make it difficult to track skipped recurring notifications
    }
  }

  static setStatus(notifIds, status, reason = null, document = 'c_axon_notif') {

    if (!this.statusList.includes(status)) {
      throw new Error(`Must send a valid status: ${this.statusList}`)
    }

    const update = {
      c_status: status,
      c_canceled_reason: reason
    }

    if (!reason) {
      delete update.c_canceled_reason
    }

    if (Array.isArray(notifIds)) {
      return org.objects[document]
        .updateMany(
          { _id: { $in: notifIds } },
          { $set: update }
        )
        .skipAcl()
        .grant(consts.accessLevels.update)
        .execute()
    } else {
      return org.objects[document]
        .updateOne({ _id: notifIds },
          { $set: update }
        )
        .skipAcl()
        .grant(consts.accessLevels.update)
        .execute()
    }
  }

  static createSentRecord(userID, notifID, document) {
    const record = {
      c_public_user: userID,
      [document]: notifID,
      c_sent: new Date()
    }

    // Insert new sent record for notification.
    return this.insertRecord('c_sent', record)
  }

  static insertRecord(document, obj) {
    return org.objects[document].insertOne(obj)
      .bypassCreateAcl()
      .grant(consts.accessLevels.update)
      .execute()
  }

  static insertCortexEvent(event, key, param, startDate) {
    const { events: Events } = org.objects
    return Events.insertOne({
      type: 'script',
      event: event,
      key: key,
      param: param,
      start: startDate
    })
      .bypassCreateAcl()
      .grant(consts.accessLevels.update)
      .execute()
  }

  static getAxonNotifsByEvent(eventID) {
    const condition = { _id: eventID, c_status: 'scheduled' }
    return org.objects.c_axon_notifs.find(condition)
      .skipAcl()
      .grant(consts.accessLevels.read)
      .toArray()
  }

}