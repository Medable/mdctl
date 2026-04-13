/**
 * @fileOverview
 * @summary Encapsulates details of working with org.objects.c_public_users
 *
 * @author Data Management Squad
 *
 * @example
 * const { CaseRepository } = require('dcr_intake__case_repository')
 */

const { SalesforceRepository } = require('dcr_intake__salesforce_repository'),
  faults = require('c_fault_lib'),
  logger = require('logger')

/**
 * Data Change Request Case Repository
 *
 * @class CaseRepository
 */

class CaseRepository {

  static types = {
    UPDATE_PARTICIPANT_ID: 'update participant id',
    MOVE_PARTICIPANT_TO_TEST_SITE: 'move participant to the test site',
    INACTIVATE_PARTICIPANT: 'inactivate participant',
    MOVE_COMPLETED_TASKS_TO_ANOTHER_VISIT: 'move completed tasks to another visit',
    INACTIVATE_TASK_RESPONSE: 'inactivate task response'
  }

  static listFilterFields = {
    dcr_intake__type: 'Type',
    dcr_intake__status: 'Status',
    dcr_intake__site_id: 'Study_Site__r.Site_Id_External__c',
    dcr_intake__number: 'DCR_Number__c'
  }

  static statuses = {
    NEW: 'New',
    IN_OPERATIONAL_REVIEW: 'In Operational Review',
    PENDING_CUSTOMER_INPUT: 'Pending Customer Input',
    CLOSED: 'Closed',
    TECHNICAL_IMPLEMENTATION: 'Technical Implementation',
    REJECTED: 'Rejected'
  }

  /**
   * Get dcr list
   * @memberOf CaseRepository
   * @param {String[]} siteIds
   * @param {Object} params
   * @param {Number} params.limit
   * @param {Number} params.offset
   * @param {String} params.orderBy
   * @param {String} params.order
   * @param {Object} params.filter
   * @return {Object} list
   */
  static list(siteIds, params) {
    if (!siteIds.length) {
      return {
        done: true,
        records: [],
        totalSize: 0
      }
    }
    const sortableFieldsMap = {
      dcr_intake__number: 'DCR_Number__c',
      dcr_intake__public_user_number: 'Participant_ID__c',
      dcr_intake__type: 'Type',
      dcr_intake__status: 'Status',
      dcr_intake__last_modified_date: 'LastModifiedDate'
    }

    if (params.orderBy) {
      params.orderBy = sortableFieldsMap[params.orderBy]
    }

    if (params.filter) {
      const filter = {}

      for (const key in params.filter) {
        if (this.listFilterFields[key]) {
          filter[this.listFilterFields[key]] = params.filter[key]
        }
      }

      params.filter = filter
    }

    const { totalSize } = SalesforceRepository.countListCases(siteIds, params),
      result = SalesforceRepository.listCases(siteIds, params)

    return {
      done: result.done,
      totalSize,
      records: result.records.map(record => this._mapSalesforceCaseListRecordToDcrListRecord(record))
    }
  }

  /**
   * Get dcr
   * @memberOf CaseRepository
   * @param {String} dcrId
   * @return {Object} dcr
   */
  static getById(dcrId) {
    const salesforceCase = SalesforceRepository.getCaseById(dcrId)
    if (!salesforceCase) {
      faults.throw('dcr_intake.notFound.dataChangeRequest')
    }
    return this._mapSalesforceCaseToDcr(salesforceCase)
  }

  /**
   * Create dcr
   * @memberOf CaseRepository
   * @param {Object} dcrInput
   * @return {Object} result
   */
  static create(dcrInput) {
    const caseInput = this._mapDcrCreateInputToSalesforceCaseCreateInput(dcrInput)
    // TODO: map result to not return Salesforce response as is
    return SalesforceRepository.createCase(caseInput)
  }

  /**
   * Update dcr with signature info
   * @memberOf CaseRepository
   * @param {String} dcrId
   * @param {String} signatureId
   * @param {String} signatureDate
   * @return {void}
   */
  static updateSignature(dcrId, signatureId, signatureDate) {
    SalesforceRepository.updateCase(dcrId, {
      Signature_ID__c: signatureId,
      Signature_Date__c: signatureDate
        .toISOString()
        .split('T')[0]
    })
  }

  /**
   * Update Salesforce Case status
   * @memberOf CaseRepository
   * @param {String} caseId
   * @param {String} status
   * @return {void}
   */
  static updateStatus(caseId, status) {
    SalesforceRepository.updateCase(caseId, {
      Status: status
    })
  }

  /**
   * Maps Salesforce Case to dcr
   * @memberOf CaseRepository
   * @param {Object} salesforceCase
   * @return {Object} DCRIntakeRequest
   */
  static _mapSalesforceCaseToDcr(salesforceCase) {
    return {
      _id: salesforceCase.Id,
      dcr_intake__closed_date: salesforceCase.ClosedDate,
      dcr_intake__created_date: salesforceCase.CreatedDate,
      dcr_intake__number: salesforceCase.DCR_Number__c,
      dcr_intake__description: salesforceCase.Description,
      dcr_intake__last_modified_date: salesforceCase.LastModifiedDate,
      dcr_intake__reason_notes: salesforceCase.Other_Reason__c,
      dcr_intake__public_user_number: salesforceCase.Participant_ID__c,
      dcr_intake__reason: salesforceCase.Reason,
      dcr_intake__status: salesforceCase.Status,
      dcr_intake__site_id: salesforceCase.Study_Site__r.Site_Id_External__c,
      dcr_intake__type: salesforceCase.Type,
      dcr_intake__changes: {
        dcr_intake__desired_value: salesforceCase.Desired_Value__c,
        dcr_intake__original_value: salesforceCase.Original_Value__c,
        dcr_intake__step_name: salesforceCase.Name_of_Step__c,
        dcr_intake__task_name: salesforceCase.Name_of_Task__c,
        dcr_intake__visit_name: salesforceCase.Name_of_Visit__c,
        dcr_intake__notes: salesforceCase.Other_Type__c
      }
    }
  }

  /**
   * Maps Salesforce Case list item to dcr list item
   * @memberOf CaseRepository
   * @param {Object} listItem
   * @return {Object} dcr list item
   */
  static _mapSalesforceCaseListRecordToDcrListRecord(listItem) {
    return {
      _id: listItem.Id,
      dcr_intake__status: listItem.Status,
      dcr_intake__public_user_number: listItem.Participant_ID__c,
      dcr_intake__type: listItem.Type,
      dcr_intake__changes: {
        dcr_intake__desired_value: listItem.Desired_Value__c,
        dcr_intake__original_value: listItem.Original_Value__c
      },
      dcr_intake__last_modified_date: listItem.LastModifiedDate,
      dcr_intake__number: listItem.DCR_Number__c
    }
  }

  /**
   * Maps dcr create input to Salesforce Case one
   * @memberOf CaseRepository
   * @param {Object} dcrInput
   * @return {Object} Salesforce Case input
   */
  static _mapDcrCreateInputToSalesforceCaseCreateInput(dcrInput) {
    const {
      dcr_intake__changes, 
      dcr_intake__type
    } = dcrInput

    // Handle branching logic data
    let branchingLogicData = null
    let originalValues = []
    let screenNames = []
    let desiredValue = null

    if (dcr_intake__type === 'update participant response' || dcr_intake__type === 'update site response') {
      if (dcr_intake__changes && dcr_intake__changes.dcr_intake__branching_logic_enabled && dcr_intake__changes.dcr_intake__step_response_data) {
        branchingLogicData = dcr_intake__changes.dcr_intake__step_response_data.map((step, index) => {
          // Collect screen names
          if (step.screen) {
            screenNames.push(step.screen)
          }

          // collect original values 
          originalValues.push({
            stepNumber: index + 1,
            screen: step.screen,
            originalValue: Array.isArray(step.originalValue) ? step.originalValue[0] : (step.originalValue || 'Skipped by branching'),
          })

          return {
            stepNumber: index + 1,
            stepResponseId: step.stepResponseId,
            taskResponseId: dcr_intake__changes.dcr_intake__task_response_id,
            stepId: step.stepId,
            screen: step.screen,
            originalValue: Array.isArray(step.originalValue) ? step.originalValue[0] : step.originalValue,
            selectedValue: step.selectedValue,
            originalInternalValue: step.originalInternalValue, 
            selectedInternalValue: step.selectedInternalValue, 
            stepKey: step.stepKey
          }
        })

        // Stringify the branching logic data for Desired_Value__c
        desiredValue = JSON.stringify(branchingLogicData)
      } else if (dcr_intake__changes && !dcr_intake__changes.dcr_intake__branching_logic_enabled) {
        // Create object with taskResponseId, stepId, stepResponseId, desiredInternalValue, originalValue, desiredValue
        desiredValue = JSON.stringify({
          taskResponseId: dcr_intake__changes.dcr_intake__task_response_id,
          stepId: dcr_intake__changes.dcr_intake__step_id,
          stepResponseId: dcr_intake__changes.dcr_intake__step_response_id,
          desiredInternalValue: dcr_intake__changes.dcr_intake__desired_internal_value,
          originalValue: dcr_intake__changes.dcr_intake__original_value,
          desiredValue: dcr_intake__changes.dcr_intake__desired_value
        })
      }
    }

    return {
      ...dcr_intake__changes && {
        Desired_Value__c: desiredValue || (Array.isArray(dcr_intake__changes.dcr_intake__desired_value)
          ? dcr_intake__changes.dcr_intake__desired_value.join(', ') || ''
          : dcr_intake__changes.dcr_intake__desired_value),
        Name_of_Step__c: dcr_intake__changes.dcr_intake__branching_logic_enabled
          ? screenNames.join('; ')
          : dcr_intake__changes.dcr_intake__step_name,
        Name_of_Task__c: dcr_intake__changes.dcr_intake__task_name,
        Name_of_Visit__c: dcr_intake__changes.dcr_intake__visit_name,
        Original_Value__c: dcr_intake__changes.dcr_intake__branching_logic_enabled ?
          JSON.stringify(originalValues)
          : (Array.isArray(dcr_intake__changes.dcr_intake__original_value)
            ? dcr_intake__changes.dcr_intake__original_value[0] || ''
            : dcr_intake__changes.dcr_intake__original_value),
        Other_Type__c: dcr_intake__changes.dcr_intake__notes
      },
      Other_Reason__c: dcrInput.dcr_intake__reason_notes,
      Description: dcrInput.dcr_intake__description,
      // Subject is a required field in Salesforce
      Subject: dcrInput.dcr_intake__type,
      Type: dcrInput.dcr_intake__type,
      Reason: dcrInput.dcr_intake__reason,
      Participant_ID__c: dcrInput.dcr_intake__public_user_number,
      Study_Site__r: {
        Site_Id_External__c: dcrInput.dcr_intake__site_id
      }
    }
  }

}

module.exports = { CaseRepository }