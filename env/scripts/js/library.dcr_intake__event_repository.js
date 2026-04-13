/**
 * @fileOverview
 * @summary Encapsulates details of working with org.objects.events
 *
 * @author Clinical Data Squad
 *
 * @example
 * const { EventRepository } = require('dcr_intake__event_repository')
 */

const { events } = org.objects,
      logger = require('logger')

/**
 * Event Repository
 *
 * @class EventRepository
 */

class EventRepository {

  /**
   * Creates an event.
   * @param {*} event event type
   * @param {*} key key
   * @param {*} param event parameters
   * @return {void}
   */
  static create(event, key, param) {
    logger.debug('EventRepository.create', { event, key, param })
    const result = events.insertOne({
      type: 'script',
      key,
      event,
      principal: script.principal._id,
      param,
      start: new Date()
    })
      .skipAcl()
      .grant('update')
      .bypassCreateAcl()
      .lean(false)
      .execute()
    logger.debug('EventRepository.create', { result })
  }

}

module.exports = { EventRepository }