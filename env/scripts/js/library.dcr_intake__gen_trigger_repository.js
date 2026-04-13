/**
 * @fileOverview
 * @summary Encapsulates details of working with org.objects.c_generation_triggers
 *
 * @author Data Management Squad
 *
 * @example
 * const { GenerationTriggerRepository } = require('dcr_intake__gen_trigger_repository')
 */

const { as } = require('decorators'),
      { c_generation_triggers } = org.objects,
      { accessLevels } = consts

/**
 * Generation Trigger Repository
 *
 * @class GenerationTriggerRepository
 */

class GenerationTriggerRepository {

  /**
   * Create anchor-date c_generation_triggers
   * @memberOf GenerationTriggerRepository
   * @param {Object} triggerInput
   * @return {String} id
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.script } })
  static createAnchorDate(triggerInput) {
    return c_generation_triggers.insertOne({
      ...triggerInput,
      c_type: 'anchor-date'
    })
      .execute()
  }

}

module.exports = { GenerationTriggerRepository }