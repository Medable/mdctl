/**
 * @fileOverview
 * @summary Encapsulates details of working with org.objects.c_public_users
 *
 * @author Data Management Squad
 *
 * @example
 * const { PublicUserRepository } = require('dcr_intake__public_user_repository')
 */

const { as } = require('decorators'),
  { c_public_users, c_task_response } = org.objects,
  { accessLevels } = consts

/**
 * Public User Repository
 *
 * @class PublicUserRepository
 */

class PublicUserRepository {

  /**
   * Check if public user exists
   * @memberOf PublicUserRepository
   * @param {String} number
   * @param {String} siteId
   * @return {Boolean} public user exists
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.read } })
  static checkIfExistsByNumberAndSiteId(number, siteId) {
    return c_public_users
      .find({
        c_number: number,
        c_site: siteId
      })
      .hasNext()
  }

  /**
   * Get public user by site id and filters if site belongs to list of accessible ones
   * @memberOf PublicUserRepository
   * @param {String} siteId
   * @param {Object} filters
   * @param {String[]=} expand
   * @return {Object} public users
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.read } })
  static findBySiteIdAndFilters(siteId, filters, expand) {
    return c_public_users
      .find({
        ...filters,
        c_site: siteId
      })
      .expand(expand)
      .toArray()
  }

  /**
   * Get public user by number
   * @memberOf PublicUserRepository
   * @param {String} number
   * @param {String[]=} expand
   * @return {Object} public user
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.read } })
  static getByNumber(number, expand = []) {
    return c_public_users
      .find({
        c_number: number
      })
      .expand(expand)
      .next()
  }

  /**
   * Validate number with cortex triggers and schema validation
   * @memberOf PublicUserRepository
   * @param {String} oldValue
   * @param {String} newValue
   * @return {Object} public user
   */
  static validateNumber(oldValue, newValue) {
    return c_public_users
      .updateOne({
        c_number: oldValue
      }, {
        $set: {
          c_number: newValue
        }
      })
      .skipAcl()
      .grant(accessLevels.script)
      .dryRun(true)
      .execute()
  }

  /**
   * Replace c_number
   * @memberOf PublicUserRepository
   * @param {String} oldValue
   * @param {String} newValue
   * @param {String=} auditMessage
   * @return {Object} update result
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.read } })
  static updateNumber(oldValue, newValue, auditMessage) {
    return c_public_users.updateOne({
      c_number: oldValue
    }, {
      $set: {
        c_number: newValue,
        ...(auditMessage && { audit: { message: auditMessage } })
      }
    })
      .execute()
  }

  /**
   * Get public user by id
   * @memberOf PublicUserRepository
   * @param {String} id
   * @param {String[]=} expand
   * @return {Object} public user
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.read } })
  static getById(id, expand = []) {
    return c_public_users
      .find({
        _id: id
      })
      .expand(expand)
      .next()
  }

  /**
   * Update c_set_date
   * require audit.message to be passed in request.body to bypass trigger.c_public_user_before_set_dates.js in axon
   * @memberOf PublicUserRepository
   * @param {String} id
   * @param {Object} setDate
   * @param {String=} auditMessage
   * @returns {Object} update result
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.script } })
  static updateSetDate(id, setDate, auditMessage) {
    return c_public_users.updateOne({
      _id: id
    }, {
      $set: {
        c_set_dates: [setDate],
        ...(auditMessage && { audit: { message: auditMessage } })
      }
    })
      .execute()
  }

  /**
   * Update c_set_patient_flags
   * @memberOf PublicUserRepository
   * @param {String} id
   * @param {Object} setPatientFlag
   * @param {String=} auditMessage
   * @returns {Object} update result
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.script } })
  static updateSetPatientFlag(id, setPatientFlag, auditMessage) {
    return c_public_users.updateOne({
      _id: id
    }, {
      $set: {
        c_set_patient_flags: [setPatientFlag],
        ...(auditMessage && { audit: { message: auditMessage } })
      }
    })
      .execute()
  }

  /**
   * Change site
   * @memberOf PublicUserRepository
   * @param {String} number
   * @param {String} siteId
   * @param {String=} auditMessage
   * @return {Object} update result
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.read } })
  static updateSiteByNumber(number, siteId, auditMessage) {
    return c_public_users.updateOne({
      c_number: number
    }, {
      $set: {
        c_site: siteId,
        ...(auditMessage && { audit: { message: auditMessage } })
      }
    })
      .execute()
  }

  /**
 * Inactivate participant with full deactivation logic
 * @memberOf PublicUserRepository
 * @param {String} number
 * @param {String=} auditMessage
 * @return {Object} update result
 */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.script } })
  static inactivateParticipant(number, auditMessage) {
    const { ParticipantDeactivation } = require('c_axon_participant_deactivation')
    
    // Get the public user to access account and other details
    const publicUser = c_public_users
      .find({ c_number: number })
      .expand(['c_account'])
      .next()
    
    if (!publicUser) {
      throw new Error(`Public user with number ${number} not found`)
    }
    
    if (!publicUser.c_account) {
      throw new Error('Public user must have an associated account')
    }
    
    // Cancel scheduled notifications
    ParticipantDeactivation.cancelNotifications(publicUser._id)
    
    // Cancel televisit events
    ParticipantDeactivation.cancelTelevisitEvents(publicUser._id)
    
    // Lock the participant's account
    org.objects.account.updateOne({ _id: publicUser.c_account._id }, { $set: { locked: true } })
      .skipAcl()
      .grant(consts.accessLevels.script)
      .execute()
    
    // Update the public user status to inactive
    return c_public_users.updateOne({
      c_number: number
    }, {
      $set: {
        c_status: 'Inactive',
        ...(auditMessage && { audit: { message: auditMessage } })
      }
    })
      .execute()
  }

  /**
   * Remove set date by id for public user number
   * @memberOf PublicUserRepository
   * @param {String} number
   * @param {String} setDateId
   * @return {String} public user id
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.script } })
  static removeSetDateForNumber(number, setDateId) {
    return c_public_users.updateOne({
      c_number: number
    }, {
      $pull: {
        c_set_dates: setDateId
      }
    })
      .execute()
  }

  /**
   * Get task responses with expanded task data for a participant
   * @memberOf PublicUserRepository
   * @param {String} c_public_user Public user ID
   * @return {Object[]} Array of task responses with expanded task information
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.script } })
  static getTaskResponsesWithTasks(c_public_user) {
    return org.objects.c_task_response.find({ c_public_user: c_public_user }).expand('c_task').toArray()
  }
}

module.exports = { PublicUserRepository }