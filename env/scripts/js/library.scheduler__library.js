// Scheduler lib
import logger from 'logger'
import config from 'config'
import moment from 'moment.timezone'

class Scheduler {

  // TODO: make this an event??
  static sendMessage(payload, shouldMarkAsGenerating = true) {
    const configData = config('scheduler__configs')
    const { data } = payload
    // change this to actual api url
    script.as('scheduler__service_account', { safe: false, principal: { skipAcl: true, grant: 'script', role: ['administrator'] } }, () => {
      let initialGenerating = false
      if((data.publicUserId || data.publicUserIds) && shouldMarkAsGenerating) {
        console.log('marking user as generating')
        const where = data.publicUserId ? { _id: data.publicUserId } : { _id: {$in: data.publicUserIds} }
        org.objects.c_public_user.updateMany(where, { $set: { c_events_generating: true } }).execute()
        initialGenerating = true
      }

      sys.sendMessage(configData.worker, configData.queue, {...payload, data: { ...data, initialGenerating }})
      logger.info(`Successfully dropped a new scheduler message in the queue: ${configData.queue}`)
    })
  }
  
  static getDiffDays(date) {
     return moment().diff(moment(date), 'days')
  }

  static checkFutureEvents(publicUser, force = false) {
    const dateToCheck = publicUser.c_future_generation_last_checked_date
    let daysFromLastGeneration = 0;
    if(dateToCheck) {
      daysFromLastGeneration = Scheduler.getDiffDays(dateToCheck)
    } else {
      logger.debug('Date to check is null, setting force to true')
      force = true
    } 
    const schedulerConfigs = config('scheduler__configs')
    logger.debug('Date to check:' + dateToCheck)
    logger.debug('Force:' + force)
    logger.debug('Current Date:' + new Date().toISOString())
    logger.debug('Days from last future events generation:' + daysFromLastGeneration)
    logger.debug('Number of days needed to pass before generate future events again:' + (schedulerConfigs.daysToCheck || 3))
    // Drop message for regenerate past user events publicUserId
    if(daysFromLastGeneration >= (schedulerConfigs.daysToCheck || 3) || force) {
      Scheduler.sendMessage({
        subject: 'custom',
        action: 'futureEvents',
        data: { publicUserId: publicUser._id }
      }, false)
      org.objects.c_public_user.updateOne({ _id: publicUser._id }, { $set: { c_future_generation_last_checked_date: new Date().toISOString() } }).skipAcl().grant(6).execute()
      logger.debug('future events message sent for public user: ' + publicUser._id)
    } else {
      logger.debug('we have generated future events recently no needed now for public user:' + publicUser._id)
    }
  }

}

module.exports = Scheduler