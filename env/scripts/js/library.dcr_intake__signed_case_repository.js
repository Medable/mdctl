/**
 * @fileOverview
 * @summary Encapsulates details of working with org.objects.dcr_intake__signed_cases
 *
 * @author Data Management Squad
 *
 * @example
 * const { SignedCaseRepository } = require('dcr_intake__signature_repository')
 */

const { as } = require('decorators'),
      faults = require('c_fault_lib'),
      { dcr_intake__signed_cases } = org.objects,
      { accessLevels } = consts

/**
 * Signed Case Repository
 *
 * @class SignedCaseRepository
 */

class SignedCaseRepository {

  /**
   * Create signed case with signature
   * @memberOf SignedCaseRepository
   * @param {Object} signedCaseInput
   * @return {String} signed case id
   */
  @as('dcr_intake__system_user', { principal: { bypassCreateAcl: true, grant: accessLevels.script } })
  static create(signedCaseInput) {
    return dcr_intake__signed_cases
      .insertOne(signedCaseInput)
      .execute()
  }

  /**
   * Update signed case with signature
   * @memberOf SignedCaseRepository
   * @param {String} signerId
   * @param {String} caseId
   * @param {Object} signatureInput
   * @return {String} signed case id
   */
  @as('dcr_intake__system_user', { principal: { bypassCreateAcl: true, grant: accessLevels.script } })
  static addSignature(signerId, caseId, signatureInput) {
    try {
      return dcr_intake__signed_cases.updateOne({
        dcr_intake__created_by: signerId,
        dcr_intake__case_id: caseId
      }, {
        $push: { dcr_intake__signatures: signatureInput }
      })
        .execute()
    } catch (error) {
      if (error.errCode === 'cortex.notFound.instance') {
        faults.throw('dcr_intake.notFound.signedCase')
      }
      throw error
    }
  }

  /**
   * @memberOf SignedCaseRepository
   * @param {Object} filters
   * @param {Object} updateInput
   * @param {String=} updateInput.dcr_intake__closed_date
   * @param {String | null} updateInput.dcr_intake__closed_by
   * @return {void}
   */
  @as('dcr_intake__system_user', { principal: { bypassCreateAcl: true, grant: accessLevels.script } })
  static updateAsClosed(filters, updateInput) {
    dcr_intake__signed_cases.updateOne(filters, {
      $set: {
        dcr_intake__closed_date: updateInput.dcr_intake__closed_date || new Date(),
        ...(updateInput.dcr_intake__closed_by && { dcr_intake__closed_by: updateInput.dcr_intake__closed_by })
      },
      $unset: {
        ...(!updateInput.dcr_intake__closed_by && { dcr_intake__closed_by: 1 })
      }
    })
      .execute()
  }

  /**
   * Find signed case by Case id
   * @memberOf SignedCaseRepository
   * @param {String} caseId
   * @param {String[]} expand
   * @return {Object[]} signed cases
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.script } })
  static findByCaseId(caseId, expand = []) {
    return dcr_intake__signed_cases
      .find({ dcr_intake__case_id: caseId })
      .expand(expand)
      .map(signedCase => ({
        ...signedCase,
        ...(signedCase.dcr_intake__signatures && {
          dcr_intake__signatures: this._extendSignatures(signedCase.dcr_intake__signatures)
        })
      }))
  }

  /**
   * Extend signatures with additional fields
   * Required for backward compatibility with versions that don't have these fields
   * @memberOf SignedCaseRepository
   * @param  {Object} signaturesData
   * @return {Object}
   */
  static _extendSignatures(signaturesData) {
    return {
      ...signaturesData,
      data: signaturesData.data.map(signatureData => ({
        ...signatureData,
        value: {
          ...signatureData.value,
          dcr_intake__case_details: signatureData.value.dcr_intake__case_details || {}
        }
      }))
    }
  }

}

module.exports = { SignedCaseRepository }