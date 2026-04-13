/**
 * @fileOverview
 * @summary Implements data change request comment logic.
 * Methods from repositories should be used to interact with other services/db.
 *
 * @author Data Management Squad
 *
 * @example
 * const { CommentService } = require('dcr_intake__comment_service')
 */

const { SalesforceRepository } = require('dcr_intake__salesforce_repository'),
      { CaseRepository } = require('dcr_intake__case_repository'),
      { AuthService } = require('dcr_intake__auth_service'),
      { AccountService } = require('dcr_intake__account_service'),
      faults = require('c_fault_lib'),
      config = require('config')

/**
 * Comment Service
 *
 * @class CommentService
 */

class CommentService {

  static visibility = {
    ALL: 'ALL',
    DATA_SERVICE_TEAM: 'DATA_SERVICE_TEAM'
  }

  /**
   * Get dcr intake comments list for the logged-in user
   * @memberOf CommentService
   * @param {String} caseId
   * @param {Object} params
   * @param {Number} params.limit
   * @param {Number} params.offset
   * @return {Object}
   */
  static listForLoggedInUser(caseId, params) {
    const result = SalesforceRepository.listCaseFeeds(caseId, params, AuthService.checkIfDataServiceTeam()),
          displayDstUsersDetails = AuthService.roleGroups.DATA_SERVICE_TEAM_ONLY.includes(AuthService.getLoggedInAccountRole())
    return {
      ...result,
      records: this._mapSalesforceCaseCommentsToDCRIntakeComments(result.records, displayDstUsersDetails)
    }
  }

  /**
   * Map records from Saleforce to Medable format
   * @memberOf CommentService
   * @param {Object[]} salesforceCaseComments
   * @param {Boolean} displayDstUsersDetails
   * @return {Object[]}
   */
  static _mapSalesforceCaseCommentsToDCRIntakeComments(salesforceCaseComments, displayDstUsersDetails) {
    const defaultCreator = config.get('dcr_intake__comment_creator')
    return salesforceCaseComments.map(record => {
      const commentDetails = this._parseComment(record.Body)
      return {
        _id: record.Id,
        dcr_intake__comment_body: commentDetails.body,
        dcr_intake__creator_name: (
          !displayDstUsersDetails &&
            this.visibility.DATA_SERVICE_TEAM === commentDetails.visibility
        ) || !commentDetails.creator
          ? defaultCreator
          : commentDetails.creator,
        dcr_intake__created_date: record.CreatedDate
      }
    })
  }

  /**
   * Create comment that is visible on both UI (with user as creator) and Salesforce
   * @memberOf CommentService
   * @param {String} caseId
   * @param {String} comment
   * @param {Object} creator
   * @param {Object=} creator.name
   * @param {String=} creator.name.first
   * @param {String=} creator.name.last
   * @param {String} creator.email
   * @param {String} creator.nameVisibility
   * @return {Object}
   */
  static createPublic(caseId, comment, creator) {
    return this._create(caseId, comment, creator, SalesforceRepository.caseFeedVisibility.ALL_USERS)
  }

  /**
   * Create comment
   * @memberOf CommentService
   * @param {String} caseId
   * @param {String} comment
   * @param {Object} creator
   * @param {Object=} creator.name
   * @param {String=} creator.name.first
   * @param {String=} creator.name.last
   * @param {String} creator.email
   * @param {String} creator.nameVisibility
   * @param {String} visibility
   * @return {Object}
   */
  static _create(caseId, comment, creator, visibility) {
    const commentBody = this._extendCommentBodyWithCreatorName(comment, creator)
    return SalesforceRepository.createTextCaseFeed(caseId, commentBody, visibility)
  }

  /**
   * Create public comment for the logged-in user
   * @memberOf CommentService
   * @param {String} caseId
   * @param {String} comment
   * @return {Object}
   */
  static createPublicForLoggedInUser(caseId, comment) {
    const dcr = CaseRepository.getById(caseId)
    if ([
      CaseRepository.statuses.CLOSED,
      CaseRepository.statuses.REJECTED
    ].includes(dcr.dcr_intake__status)) {
      faults.throw('dcr_intake.accessDenied.dcrClosed')
    }
    const isDataServiceTeam = AuthService.checkIfDataServiceTeam()
    if (![
      CaseRepository.statuses.NEW,
      CaseRepository.statuses.IN_OPERATIONAL_REVIEW
    ].includes(dcr.dcr_intake__status) &&
      (
        !isDataServiceTeam ||
        dcr.dcr_intake__status !== CaseRepository.statuses.PENDING_CUSTOMER_INPUT
      )
    ) {
      CaseRepository.updateStatus(caseId, CaseRepository.statuses.IN_OPERATIONAL_REVIEW)
    }
    return this.createPublic(caseId, comment, {
      name: AuthService.getLoggedInAccountName(),
      email: AuthService.getLoggedInAccountEmail(),
      nameVisibility: isDataServiceTeam ? this.visibility.DATA_SERVICE_TEAM : this.visibility.ALL
    })
  }

  /**
   * Create internal comment for the logged-in user
   * @memberOf CommentService
   * @param {String} caseId
   * @param {String} comment
   * @return {Object}
   */
  static createInternalForLoggedInUser(caseId, comment) {
    return this.createInternal(caseId, comment, {
      name: AuthService.getLoggedInAccountName(),
      email: AuthService.getLoggedInAccountEmail()
    })
  }

  /**
   * Create comment that is visible on Salesforce only
   * @memberOf CommentService
   * @param {String} caseId
   * @param {String} comment
   * @param {Object} creator
   * @param {Object=} creator.name
   * @param {String=} creator.name.first
   * @param {String=} creator.name.last
   * @param {String} creator.email
   * @return {Object}
   */
  static createInternal(caseId, comment, creator) {
    return this._create(caseId, comment, {
      ...creator,
      visibility: this.visibility.DATA_SERVICE_TEAM
    }, SalesforceRepository.caseFeedVisibility.INTERNAL_USERS)
  }

  /**
   * Add user's info to comment text.
   * Required because all comments on Salesforce are created on behalf of credentials owner.
   * @memberOf CommentService
   * @param {String} commentBody
   * @param {Object} creator
   * @param {Object=} creator.name
   * @param {String=} creator.name.first
   * @param {String=} creator.name.last
   * @param {String} creator.email
   * @param {String} creator.nameVisibility
   * @return {String} updated comment
   */
  static _extendCommentBodyWithCreatorName(commentBody, creator) {
    const { name, email, nameVisibility } = creator,
          fullName = AccountService.mapFullName(name)
    return `<p><b>[${nameVisibility}]${fullName ? `${fullName} (${email})` : email}:</b></p>${commentBody}`
  }

  /**
   * Parse comment to separate creator's name from rest of the body.
   * @memberOf CommentService
   * @param {String} comment
   * @return {Object} comment body, creator's name and visibility
   */
  static _parseComment(comment) {
    const matchedCreator = comment.match('<p><b>(.*):</b></p>')
    // to support internal / legacy public comments without role specified as part of comment body
    if (!matchedCreator) {
      return {
        visibility: this.visibility.DATA_SERVICE_TEAM,
        body: comment
      }
    }
    const parsedComment = comment.substring(matchedCreator[0].length),
          matchedNameVisibility = matchedCreator[1].match('\\[(.*)\\]')
    if (matchedNameVisibility) {
      return {
        creator: matchedCreator[1].substring(matchedNameVisibility[0].length),
        visibility: matchedNameVisibility[1],
        body: parsedComment
      }
    }
    // to support internal / legacy public comments without role specified as part of comment body
    return {
      creator: matchedCreator[1],
      visibility: this.visibility.ALL,
      body: parsedComment
    }
  }

}

module.exports = {
  CommentService
}