// ThresholdHandler.js
/*
 * The ThresholdHandler class is responsible for managing and processing threshold-related
 * actions for health data within the Cortex system. It encapsulates the logic for evaluating
 * health data against predefined thresholds and executing defined actions when those thresholds
 * are met. This includes checking health data values, comparing them with configured thresholds,
 * and triggering appropriate actions such as sending notifications or setting patient flags.
 */
import decorators from 'decorators'
import notifications from 'notifications'
import logger from 'logger'

const { trigger, as } = decorators

// eslint-disable-next-line no-undef
class ThresholdHandler extends CortexObject {

  /**
   * Check if the health datum value is out of threshold
   * @param {object} healthDatum - The health datum object.
   * @param {object} patient - The patient object.
   * @param {object} site - The site object.
   * @returns {Promise} - A promise that resolves when the health datum items are inserted.
   */
  static checkThreshold(healthDatum, patient, site) {
    const { c_data: { value, unit, measure_type }, c_device } = healthDatum
    const thresholdConfigurations = org.objects.cdb__threshold_configurations
      .find({
        c_measure_type: measure_type,
        c_enabled: true
      })
      .expand('c_conditions', 'c_actions')
      .toArray()

    if (!thresholdConfigurations.length) return

    for (const tc of thresholdConfigurations) {
      const conditionsMet = tc.c_conditions.data.some(condition => {
        const { c_operator, c_measure_unit, c_threshold } = condition
        if (c_measure_unit !== unit) return false
        return this._evaluateCondition(c_operator, value, c_threshold)
      })

      if (!conditionsMet) continue
      for (const action of tc.c_actions.data.filter(a => a.c_enabled)) {
        const [actionDetails] = org.objects.cdb__threshold_configuration_actions
          .find({ _id: action._id })
          .paths('c_type', 'c_enabled', 'c_threshold_configuration', 'c_notification_template', 'c_patient_flag')
          .toArray()
        this._processAction(actionDetails, patient, site, measure_type, value, unit, c_device)
      }
    }
  }

  /**
   * Evaluates a condition based on an operator and threshold.
   * @param {String} operator - The operator (GT, LT, GTE, LTE).
   * @param {Number} value - The value to compare.
   * @param {Number} threshold - The threshold value.
   * @returns {Boolean} - True if the condition is met.
   */
  static _evaluateCondition(operator, value, threshold) {
    switch (operator) {
      case 'GT': return value > threshold
      case 'LT': return value < threshold
      case 'GTE': return value >= threshold
      case 'LTE': return value <= threshold
      default: return false
    }
  }

  // Entry point for processing actions based on the threshold configuration
  static _processAction(action, patient, site, measureType, value, unit, device) {
    switch (action.c_type) {
      case 'SITE_NOTIFICATION':
        this._handleSiteNotification(action, patient, site, measureType, value, unit, device)
        break
      case 'TRIGGER_PATIENT_FLAG':
        this._handlePatientFlag(action, patient)
        break
      default:
      // Handle other action types if necessary
        break
    }
  }

  // Handles sending notifications to site users
  static _handleSiteNotification(action, patient, site, measureType, value, unit, device) {
    if (!action.c_notification_template) {
      logger.error('Notification template is not set for threshold configuration. Threshold configuration id:' + action.c_threshold_configuration._id)
      return
    }

    const siteUsers = this._getSiteUsers()
    logger.error('Site users.length' + JSON.stringify(siteUsers.length))
    logger.error('Site users' + JSON.stringify(siteUsers))
    if (!siteUsers.length) return

    siteUsers.forEach(siteUser => {
      try {
        this._sendSiteNotification(action, patient, site, measureType, value, unit, device, siteUser)
        logger.info({
          notification: action.c_notification_template,
          email: siteUser.c_account.email,
          recipientId: siteUser.c_account._id,
          patient: patient._id,
          site: site._id,
          measure: measureType,
          value: value,
          unit: unit
        })
      } catch (e) {
        logger.error('Error happened to send site notification. Error:' + JSON.stringify(e))
      }
    })
  }

  // Retrieves site users for notifications
  static _getSiteUsers() {
    return org.objects.c_site_users.find()
      .expand('c_account')
      .grant(7)
      .skipAcl(true)
      .limit(1000)
      .toArray()
  }

  // Sends notification to a single site user
  static _sendSiteNotification(action, patient, site, measureType, value, unit, device, siteUser) {
    notifications.send(action.c_notification_template, {
      subject_number: patient.c_number || '',
      site_number: site.c_number || '',
      measure: {
        type: measureType,
        value,
        unit,
        device: {
          name: device.name,
          type: device.type
        }
      }
    }, { recipient: siteUser.email })
  }

  // Handles the logic for triggering a patient flag
  static _handlePatientFlag(action, patient) {
    if (!action.c_patient_flag) {
      logger.error('Patient flag is not set for threshold configuration. Threshold configuration id:' + action.c_threshold_configuration._id)
      return
    }
    const patientFlag = this._getPatientFlag(action)
    if (!patientFlag) return

    const existingFlagIndex = this._findExistingFlagIndex(patient, patientFlag)
    this._updatePatientFlag(patient, patientFlag, existingFlagIndex)
  }

  // Retrieves patient flag based on the action
  static _getPatientFlag(action) {
    const result = org.objects.c_patient_flags
      .find({ c_identifier: action.c_patient_flag })
      .toArray()
    if (!result || !result.length) {
      logger.error('Patient flag is not found. Patient flag key:' + action.c_patient_flag)
      return null
    }
    const [patientFlag] = result
    return patientFlag
  }

  // Finds the index of the existing flag in the patient's flag set
  static _findExistingFlagIndex(patient, patientFlag) {
    const { c_set_patient_flags: setPatientFlags } = patient
    return setPatientFlags ? setPatientFlags.findIndex(({ c_flag: patientFlagRef }) => patientFlagRef._id.toString() === patientFlag._id.toString()) : -1
  }

  // Updates the patient's flag based on its current state
  static _updatePatientFlag(patient, patientFlag, existingFlagIndex) {
    if (existingFlagIndex !== -1 && !patient.c_set_patient_flags[existingFlagIndex].c_enabled) {
      this._removeAndReAddPatientFlag(patient, patientFlag, existingFlagIndex)
    } else if (existingFlagIndex === -1) {
      this._addPatientFlag(patient, patientFlag)
    }
  }

  // Removes and re-adds a patient flag
  static _removeAndReAddPatientFlag(patient, patientFlag, existingFlagIndex) {
    org.objects.c_public_users.updateOne(
      { _id: patient._id },
      { $remove: { c_set_patient_flags: [patient.c_set_patient_flags[existingFlagIndex]._id] } }
    )
      .skipAcl()
      .grant(8)
      .execute()

    this._addPatientFlag(patient, patientFlag)
  }

  // Adds a new patient flag
  static _addPatientFlag(patient, patientFlag) {
    org.objects.c_public_user.updateOne(
      { _id: patient._id },
      {
        $push: {
          c_set_patient_flags: {
            c_flag: patientFlag._id,
            c_identifier: patientFlag.c_label,
            c_enabled: true
          }
        }
      }
    )
      .skipAcl()
      .grant(8)
      .execute()
  }

  @trigger('create.after', {
    name: 'cdb__threshold_after_create',
    export: 'cdb__threshold_after_create',
    object: 'c_health_datum',
    weight: 1
  })
  @as('cdb__service', { principal: { skipAcl: true, grant: 'script' }, safe: false })
  static afterHealthDatumCreate({ context }) {
    const [healthDatum] = org.objects.c_health_datums.find({ _id: context._id })
            .toArray(),
          [step_response] = org.objects.c_step_responses.find({ _id: healthDatum.c_source })
            .toArray()
    // Check if the step response relates to cdb
    if (!step_response || !step_response.c_site) {
      return
    }
    const [site] = org.objects.c_sites.find({ _id: step_response.c_site._id })
            .toArray(),
          [patient] = org.objects.c_public_users.find({ _id: healthDatum.c_patient })
            .toArray()
    this.checkThreshold(healthDatum, patient, site)
  }

}
module.exports = ThresholdHandler