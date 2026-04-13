// /**
//  * @fileOverview
//  * @summary Step Response Handler
//  * @version 1.0.0
//  */
import Utils from 'cdb__utils'
const { trigger, as } = require('decorators')
// eslint-disable-next-line no-unused-vars
const logger = require('logger')

/**
 * Step Response Handler
 * @class StepResponseHandler
 */
// eslint-disable-next-line no-unused-vars, no-undef
class StepResponseHandler extends CortexObject {

  /**
 * Creates health datum items based on received values, step response, and step information.
 * @param {object} receivedValue - The received value object.
 * @param {object} stepResponse - The step response object.
 * @param {object} step - The step object.
 * @returns {Promise} - A promise that resolves when the health datum items are inserted.
 */
  static createHealthDatum(receivedValue, stepResponse, step) {
    try {
      // Mapping received values to health datum items
      const hdItems = receivedValue.value.map((item) => ({
        c_uuid: Utils.uuidv4(),
        c_data: {
          value: item.value,
          date: item.date,
          lastSequenceId: receivedValue.lastSequenceId,
          collect_mode: step.c_collect_mode,
          step_response: stepResponse._id,
          task_step: step._id,
          task: stepResponse.c_task._id,
          platform: receivedValue.platform,
          unit: item.unit,
          measure_type: item.measure_type
        },
        c_device: {
          serialNo: receivedValue.device.serialNo,
          name: receivedValue.device.name,
          type: receivedValue.device.type || step.c_device,
          modelNumber: receivedValue.device.modelNumber
        },
        c_patient: stepResponse.c_public_user._id,
        c_source: stepResponse._id,
        c_start: new Date(),
        c_end: new Date(),
        c_type: item.measure_type
      }))
      // Inserting health datum items
      return org.objects.c_health_datum
        .insertMany(hdItems)
        .bypassCreateAcl()
        .grant(8)
        .execute()
    } catch (e) {
      logger.error('error in createHealthDatum:' + JSON.stringify(e))
      return null
    }
  }

  /**
 * Updates the value of a step response based on the received value.
 * @param {object} receivedValue - The received value object.
 * @param {object} stepResponse - The step response object.
 * @returns {Promise} - A promise that resolves when the step response is updated.
 */
  static updateStepResponse(receivedValue, stepResponse) {
    const { _id } = stepResponse
    // Updating the step response value
    return org.objects.c_step_response
      .updateOne({ _id }, { $set: { c_value: JSON.stringify(receivedValue.value) } })
      .execute()
  }

  /**
   * Updates the step response and creates health datum items based on received values.
   * @param {object} step - The step object.
   * @param {object} stepResponse - The step response object.
   * @param {boolean} fromCreate - Indicates if the method is called from create or update.
   */
  static updateData(step, stepResponse, fromCreate) {
    const receivedValue = JSON.parse(stepResponse.c_value)
    if (receivedValue.value && receivedValue.value.length > 0 && receivedValue.device) {
      this.createHealthDatum(receivedValue, stepResponse, step)
      this.updateStepResponse(receivedValue, stepResponse)
    }
  }

/**
 * Triggered after creating a c_step_response object.
 * @triggerName cdb_c_step_response_after_create
 * @triggerExport cdb_c_step_response_after_create
 * @triggerObject c_step_response
 * @triggerWeight 1
 */
@trigger('update.after', {
  name: 'cdb__step_response_after_update',
  export: 'cdb__step_response_after_update',
  object: 'c_step_response',
  weight: 1
})
@as('cdb__service', { principal: { skipAcl: true, grant: 'script' }, safe: false })
  static afterStepResponseUpdate({ context, modified }) {
    const [stepResponse] = org.objects.c_step_response.find({ _id: context._id }),
          [step] = org.objects.c_step.find({ _id: stepResponse.c_step._id }),
          hasToRun = modified ? modified.filter(m => ['c_value'].indexOf(m) > -1) : []
    // Check if the step and step response have device and value
    if (hasToRun && step.c_device && stepResponse.c_value) {
      this.updateData(step, stepResponse, false)
    }
  }

  @trigger('create.after', {
    name: 'cdb__step_response_after_create',
    export: 'cdb__step_response_after_create',
    object: 'c_step_response',
    weight: 1
  })
  @as('cdb__service', { principal: { skipAcl: true, grant: 'script' }, safe: false })
static afterStepResponseCreate({ context }) {
  const [stepResponse] = org.objects.c_step_response.find({ _id: context._id }),
        [step] = org.objects.c_step.find({ _id: stepResponse.c_step._id })
  // Check if the step and step response have device and value
  if (step.c_device && stepResponse.c_value) {
    this.updateData(step, stepResponse, true)
  }
}

}
module.exports = StepResponseHandler