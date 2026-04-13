/**
 * @fileOverview
 * @summary Implements account related logic.
 * Methods from repositories should be used to interact with other services/db.
 *
 * @author Data Management Squad
 *
 * @example
 * const { AccountService } = require('dcr_intake__account_service')
 */

const faults = require('c_fault_lib'),
      { roles } = require('consts'),
      { AccountRepository } = require('dcr_intake__account_repository')

/**
 * Account Service
 *
 * @class AccountService
 */

class AccountService {

  /**
   * Verify account by credentials
   * @memberOf AccountService
   * @param {String} email
   * @param {String} password
   * @return
   */
  static verifyCredentials(email, password) {
    try {
      AccountRepository.attemptAuth(email, password)
    } catch (err) {
      faults.throw('dcr_intake.accessDenied.invalidCredentials')
    }
  }

  /**
   * Check if patient role
   * @memberOf AccountService
   * @param {String[]} accountRoles
   * @return Boolean
   */
  static checkIfPatient(accountRoles) {
    return !accountRoles || this.checkCortexRoles(accountRoles, [
      roles['Study Participant']
    ])
  }

  /**
   * Check if dst role
   * @memberOf AccountService
   * @param {String[]} accountRoles
   * @return Boolean
   */
  static checkIfDataServiceTeam(accountRoles) {
    return this.checkCortexRoles(accountRoles, [
      roles['DCR Data Service Team']
    ])
  }

  /**
   * Check if view only role
   * @memberOf AccountService
   * @param {String[]} accountRoles
   * @return Boolean
   */
  static checkIfViewOnlyRole(accountRoles) {
    return this.checkCortexRoles(accountRoles, [
      roles['Data Manager'], roles['Data Reviewer'], roles['Administrator']
    ])
  }

  /**
   * Check if one of the expected cortex roles assigned
   * @memberOf AccountService
   * @param {String[]=} accountRoles
   * @param {String[]} expectedRoles
   * @return Boolean
   */
  static checkCortexRoles(accountRoles, expectedRoles) {
    const existingExpectedRoles = expectedRoles
      .reduce((availableRoles, role) => {
        if (role) {
          availableRoles.push(role.toString())
        }
        return availableRoles
      }, [])
    return accountRoles && accountRoles.some(roleId => existingExpectedRoles.includes(roleId.toString()))
  }

  /**
   * Map full name
   * @memberOf AccountService
   * @param {Object} name
   * @param {String=} name.first
   * @param {String=} name.last
   * @return String
   */
  static mapFullName(name) {
    return name && name.first && name.last ? `${name.first} ${name.last}` : ''
  }

}

module.exports = { AccountService }