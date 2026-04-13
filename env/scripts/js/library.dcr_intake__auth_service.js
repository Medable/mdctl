/**
 * @fileOverview
 * @summary Implements authorization related logic.
 * Methods from repositories should be used to interact with other services/db.
 *
 * @author Data Management Squad
 *
 * @example
 * const { AuthService } = require('dcr_intake__auth_service')
 */

const faults = require('c_fault_lib'),
      { roles } = require('consts'),
      { AccountService } = require('dcr_intake__account_service'),
      { SiteUserRepository } = require('dcr_intake__site_user_repository'),
      dcrRoles = {
        SITE_USER: 'SITE_USER',
        AXON_SITE_USER: 'AXON_SITE_USER',
        DATA_SERVICE_TEAM: 'DATA_SERVICE_TEAM',
        SITE_MONITOR: 'SITE_MONITOR',
        AXON_SITE_MONITOR: 'AXON_SITE_MONITOR',
        DCR_VIEW_AND_COMMENT: 'DCR_VIEW_AND_COMMENT',
        DCR_VIEW_ONLY: "DCR_VIEW_ONLY"
      }

/**
 * Auth Service
 *
 * @class AuthService
 */

class AuthService {

    static roles = dcrRoles

    static roleGroups = {
      SITE_USER_ONLY: [
        dcrRoles.AXON_SITE_USER,
        dcrRoles.SITE_USER
      ],
      ANY: [
        dcrRoles.AXON_SITE_USER,
        dcrRoles.SITE_USER,
        dcrRoles.DATA_SERVICE_TEAM,
        dcrRoles.AXON_SITE_MONITOR,
        dcrRoles.SITE_MONITOR,
        dcrRoles.DCR_VIEW_AND_COMMENT
      ],
      DATA_SERVICE_TEAM_ONLY: [
        dcrRoles.DATA_SERVICE_TEAM
      ]
    }

    /**
     * Check role and save it in session
     * @memberOf AccountService
     * @param {String[]} expectedRoles
     * @return
     */
    static authorize(expectedRoles) {
      const expectedRole = expectedRoles.find((role) => {
        switch (role) {
          case this.roles.DCR_VIEW_ONLY:
            return AccountService.checkIfViewOnlyRole(script.principal.roles)
          case this.roles.DATA_SERVICE_TEAM:
            return AccountService.checkIfDataServiceTeam(script.principal.roles)
          case this.roles.DCR_VIEW_AND_COMMENT:
            return AccountService.checkCortexRoles(script.principal.roles, [
              roles['DCR view and comment']
            ])
          case this.roles.SITE_USER:
            return SiteUserRepository.checkIfExistsByAccountIdAndRoles(script.principal._id, ['Site User', 'Site Investigator'])
          case this.roles.AXON_SITE_USER:
            return AccountService.checkCortexRoles(script.principal.roles, [
              roles['Axon Site User'],
              roles['Axon Site Investigator']
            ])
          case this.roles.SITE_MONITOR:
            return SiteUserRepository.checkIfExistsByAccountIdAndRoles(script.principal._id, ['Site Monitor'])
          case this.roles.AXON_SITE_MONITOR:
            return AccountService.checkCortexRoles(script.principal.roles, [
              roles['Axon Site Monitor']
            ])
          default:
            return false
        }
      })
      if (expectedRole) {
        script.principal.dcr__role = expectedRole
      } else {
        faults.throw('dcr_intake.accessDenied.role')
      }
    }

    /**
     * Check if account is data service team
     * @memberOf AuthService
     * @return {boolean}
     */
    static checkIfDataServiceTeam() {
      return script.principal.dcr__role === this.roles.DATA_SERVICE_TEAM
    }

    /**
     * Get the id of the logged-in user
     * @memberOf AuthService
     * @return {String}
     */
    static getLoggedInAccountId() {
      return script.principal._id
    }

    /**
     * Get the email of the logged-in user
     * @memberOf AuthService
     * @return {String}
     */
    static getLoggedInAccountEmail() {
      return script.principal.email
    }

    /**
     * Get the name of the logged-in user
     * @memberOf AuthService
     * @return {String | undefined}
     */
    static getLoggedInAccountName() {
      return script.principal.name
    }

    /**
     * Get the dcr role of the logged-in user
     * @memberOf AuthService
     * @return {String}
     */
    static getLoggedInAccountRole() {
      return script.principal.dcr__role
    }

}

module.exports = { AuthService }