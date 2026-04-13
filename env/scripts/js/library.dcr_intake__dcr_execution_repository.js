/**
 * @fileOverview
 * @summary Encapsulates details of working with org.objects.dcr_intake__dcr_execution
 *
 * @author Data Management Squad
 *
 * @example
 * const { DcrExecutionRepository } = require('dcr_intake__dcr_execution_repository')
 */

const { as } = require('decorators'),
      { dcr_intake__dcr_execution } = org.objects,
      { accessLevels } = consts

/**
 * Data Change Request Execution Repository
 *
 * @class DcrExecutionRepository
 */

class DcrExecutionRepository {

  static trigger = {
    MANUAL: 'MANUAL',
    AUTOMATED: 'AUTOMATED'
  }

  static status = {
    SUCCESS: 'SUCCESS',
    FAILED: 'FAILED',
    IN_PROGRESS: 'IN_PROGRESS'
  }

  static types = {
    UNSET_ANCHOR_DATE_TEMPLATE: 'unset anchor date template',
    REGENERATE_ANCHOR_DATE_EVENTS: 'regenerate anchor date events',
    UPDATE_PARTICIPANT_ID: 'update participant id',
    INACTIVATE_PARTICIPANT: 'inactivate participant',
    MOVE_COMPLETED_TASKS_TO_ANOTHER_VISIT: 'move completed tasks to another visit',
    UPDATE_STEP_RESPONSE: 'update step response',
    INACTIVATE_TASK_RESPONSE: 'inactivate task response',
    RESET_PATIENT_FLAG: 'reset patient flag'
  }

  /**
   * Create dcr execution
   * dcr_intake__system_user could not be used to preserve correct creator
   * @memberOf DcrExecutionRepository
   * @param {Object} executionInput
   * @return {String} id
   */
  static _create(executionInput) {
    return dcr_intake__dcr_execution
      .insertOne(executionInput)
      .bypassCreateAcl()
      .grant(accessLevels.update)
      .execute()
  }

  /**
   * Create dcr execution for MANUAL trigger
   * @memberOf DcrExecutionRepository
   * @param {Object} executionInput
   * @return {String} id
   */
  static createManual(executionInput) {
    return this._create({
      ...executionInput,
      dcr_intake__trigger: DcrExecutionRepository.trigger.MANUAL
    })
  }

  /**
   * Create dcr execution for AUTOMATED trigger
   * @memberOf DcrExecutionRepository
   * @param {Object} executionInput
   * @return {String} id
   */
  static createAutomated(executionInput) {
    return this._create({
      ...executionInput,
      dcr_intake__trigger: DcrExecutionRepository.trigger.AUTOMATED
    })
  }

  /**
   * Update dcr execution
   * @memberOf DcrExecutionRepository
   * @param {String} id
   * @param {Object} data
   * @return {Object} update result
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.update } })
  static update(id, data) {
    return dcr_intake__dcr_execution.updateOne({
      _id: id
    }, {
      $set: data
    })
      .execute()
  }

  /**
   * Get dcr execution by id
   * @memberOf SiteRepository
   * @param {String} id
   * @param {String[]=} expand
   * @return {Object} dcr execution
   */
  static getById(id, expand = []) {
    return dcr_intake__dcr_execution
      .find({
        _id: id
      })
      .expand(expand)
      .skipAcl()
      .grant(accessLevels.read)
      .next()
  }

}

module.exports = { DcrExecutionRepository }