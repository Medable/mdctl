/**
 * @fileOverview
 * @summary Encapsulates details of working with Salesforce API
 *
 * @author Data Management Squad
 *
 * @example
 * const { SalesforceRepository } = require('dcr_intake__salesforce_repository')
 */

const cache = require('cache'),
      config = require('config'),
      http = require('http'),
      logger = require('logger'),
      API_VERSION = 'services/data/v55.0',
      CACHE_TIME = 86400 // 24 hours
/**
 * Salesforce Repository
 *
 * Prerequisites:
    - For instructions for setting the dcr_intake__salesforce_credentials config key,
      see https://confluence.devops.medable.com/display/~william.wan@medable.com/Data+Change+Request+%28DCR%29+notes
 *
 * @class SalesforceRepository
 */

class SalesforceRepository {

  static caseFeedVisibility = {
    INTERNAL_USERS: 'InternalUsers',
    ALL_USERS: 'AllUsers'
  }

  /**
   * Get and cache salesforce API login information
   * @memberOf SalesforceRepository
   * @params {Boolean} noCache - forces the function to call Salesforce API
   * @return {Object} information used to log into salesforce (instanceUrl, access_token)
   */
  static _getSessionAuth(noCache) {
    const authInfo = cache.get('dcr_intake__auth_information')
    if (!noCache && authInfo) {
      return authInfo
    }
    const createTokenInfo = config.get('dcr_intake__salesforce_auth_credentials'),
          query = Object.keys(createTokenInfo.params)
            .map(key => `${key}=${createTokenInfo.params[key]}`)
            .join('&'),
          response = http.post(`${createTokenInfo.baseUrl}?${query}`)
    if (response.statusCode >= 400) {
      logger.error('dcr_intake: Salesforce auth failed:', {
        responseStatusCode: response.statusCode,
        responseBody: response.body
      })
      throw response
    }
    const result = JSON.parse(response.body)
    cache.set('dcr_intake__auth_information', result, CACHE_TIME)
    return result
  }

  /**
   * Make get request
   * @memberOf SalesforceRepository
   * @params {Object} requestParams
   * @params {Boolean} noCacheAuth - flag to check if retry shouldn't be made when auth is invalid
   * @return {Object} salesforce object information
   */
  static _makeRequest(requestParams, noCacheAuth = false) {
    const { method, path, body } = requestParams,
          authInfo = this._getSessionAuth(noCacheAuth),
          response = http[method](`${authInfo.instance_url}/${API_VERSION}/${path}`, {
            headers: {
              Authorization: `Bearer ${authInfo.access_token}`,
              'Content-Type': 'application/json'
            },
            ...body && { body: JSON.stringify(body) }
          })
    if (response.statusCode >= 400) {
      if (response.statusCode === 401 && !noCacheAuth) {
        return this._makeRequest({ method, path, body }, true)
      }
      logger.error('dcr_intake: Salesforce request failed:', {
        method,
        path,
        requestBody: body,
        responseStatusCode: response.statusCode,
        responseBody: response.body
      })
      throw response
    }
    if (!response.body) return
    return JSON.parse(response.body)
  }

  /**
   * Convert SOQL to url query param
   * @memberOf SalesforceRepository
   * @params {String} soql
   * @response {String} 'SELECT+Id+...'
   */
  static _convertSOQLToQuery(soql) {
    return soql
      .replace(/\s/g, '+')
      .replace(/,/g, '+,+')
  }

  /**
   * Generate SOQL url query param to retrieve list of Case objects
   * @memberOf SalesforceRepository
   * @param  {String[]} siteIds
   * @param  {Object} params
   * @param  {Number} params.limit
   * @param  {Number} params.offset
   * @param  {String} params.orderBy
   * @param  {String} params.order
   * @param  {Object} params.filter
   * @param  {String[]} params.fields
   * @param  {String=} lastCreatedDate
   * @response {String} 'SELECT+Id+...'
   */
  static _generateListCasesQuery(siteIds, params, lastCreatedDate) {
    let limitOffset = ''
    let order = 'CreatedDate desc'
    if (params.limit && params.offset) {
      limitOffset = `limit ${params.limit} offset ${params.offset}`
    }
    if (params.orderBy && params.order) {
      order = `${params.orderBy} ${params.order}`
    }

    const queryRaw = `
            select
              ${params.fields.toString()}
            from
              Case
            where
              ${this._getListWhereClauses(siteIds, params.filter, lastCreatedDate)}
            order by
              ${order}
            ${limitOffset}
          `
    return this._convertSOQLToQuery(queryRaw)
  }

  /**
   * Generate SOQL url query param to retrieve single Case
   * @memberOf SalesforceRepository
   * @param  {String} caseId
   * @response {String} 'SELECT+Id+...'
   */
  static _generateSingleCaseQuery(caseId) {
    const queryRaw = `
      select
        ClosedDate,
        CreatedDate,
        DCR_Number__c,
        Description,
        Desired_Value__c,
        Id,
        LastModifiedDate,
        Name_of_Step__c,
        Name_of_Task__c,
        Name_of_Visit__c,
        Original_Value__c,
        Other_Reason__c,
        Other_Type__c,
        Participant_ID__c,
        Reason,
        Status,
        Study_Site__r.Site_Id_External__c,
        SuppliedEmail,
        Type
      from
        Case
      where
        Id = '${caseId}'
      limit 1  
    `
    return this._convertSOQLToQuery(queryRaw)
  }

  /**
   * Generate SOQL url query param to count cases
   * @memberOf SalesforceRepository
   * @param  {String[]} siteIds
   * @param  {Object} params
   * @param  {Object} params.filter
   * @response {String} 'SELECT+Id+...'
   */
  static _generateCountListCasesQuery(siteIds, params = {}) {
    const queryRaw = `
            select
              count()
            from
              Case
            where
              ${this._getListWhereClauses(siteIds, params.filter)}
          `
    return this._convertSOQLToQuery(queryRaw)
  }

  /**
   * Generate a SOQL of where clauses for Case list
   * @memberOf SalesforceRepository
   * @param  {String[]} siteIds
   * @param  {Object} filter
   * @param  {String=} lastCreatedDate
   * @response {String} SOQL where statements
   */
  static _getListWhereClauses(siteIds, filter = {}, lastCreatedDate) {
    let listWhereClauses = `
      Study_Site__r.Site_Id_External__c in ('${siteIds.join("','")}')
      and RecordTypeId = '${this._getRecordTypeId()}'  
    `
    if (lastCreatedDate) {
      listWhereClauses += ` and CreatedDate > ${lastCreatedDate.replace('+', '%2B')}`
    }

    Object.keys(filter)
      .forEach((key) => {
        listWhereClauses += ` and ${key} = '${filter[key]}'`
      })

    return listWhereClauses
  }

  /**
   * Get Case list with metadata
   * @memberOf SalesforceRepository
   * @param  {String[]} siteIds
   * @param  {Object} params
   * @param  {Number} params.limit
   * @param  {Number} params.offset
   * @param  {String} params.orderBy
   * @param  {String} params.order
   * @param  {Object} params.filter
   * @param  {String=} lastCreatedDate
   * @return {Object} find result
   */
  static listCases(siteIds, params, lastCreatedDate) {
    const maxAllowedOffset = 2000
    if (params.offset >= maxAllowedOffset) {
      const { records } = this._findByQuery(this._generateListCasesQuery(siteIds, {
        ...params,
        fields: [
          'CreatedDate'
        ],
        offset: 0,
        limit: maxAllowedOffset
      }, lastCreatedDate))
      if (records.length < maxAllowedOffset) {
        return {
          done: true,
          records: []
        }
      }
      return this.listCases(siteIds, {
        ...params,
        offset: params.offset - maxAllowedOffset
      }, records[records.length - 1].CreatedDate)
    } else {
      return this._findByQuery(this._generateListCasesQuery(siteIds, {
        ...params,
        fields: [
          'Id',
          'DCR_Number__c',
          'Participant_ID__c',
          'Type',
          'Original_Value__c',
          'Desired_Value__c',
          'Status',
          'LastModifiedDate'
        ]
      }, lastCreatedDate))
    }
  }

  /**
   * Find by query
   * @memberOf SalesforceRepository
   * @param  {String} query
   * @return {Object} find result
   */
  static _findByQuery(query) {
    return this._makeRequest({
      method: 'get',
      path: `query/?q=${query}`
    })
  }

  /**
   * Get Feed list with metadata
   * @memberOf SalesforceRepository
   * @param {String} caseId
   * @param {Object} params
   * @param {Number} params.limit
   * @param {Number} params.offset
   * @param {Boolean} includeInternalFeeds including internalUser visibility feeds
   * @return {Object} Feed list
   */
  static listCaseFeeds(caseId, params, includeInternalFeeds) {
    const { limit, offset } = params,
          visibilityCondition = includeInternalFeeds
            ? `('${this.caseFeedVisibility.INTERNAL_USERS}', '${this.caseFeedVisibility.ALL_USERS}')`
            : `('${this.caseFeedVisibility.ALL_USERS}')`,
          queryRaw = `
            select Id, Body, CreatedDate
            from
              casefeed
            where
              ParentId = '${caseId}' 
              and Type = 'TextPost'
              and Visibility in ${visibilityCondition}
            order by
              CreatedDate desc
            limit ${limit} 
            offset ${offset}  
            `
    return this._findByQuery(this._convertSOQLToQuery(queryRaw))
  }

  /**
   * Create FeedItem for Salesforce to create CaseFeed.
   * @memberOf SalesforceRepository
   * @param {String} caseId
   * @param {String} body
   * @param {String} visibility
   * @return {Object} creation result
   */
  static createTextCaseFeed(caseId, body, visibility) {
    return this._makeRequest({
      method: 'post',
      path: 'sobjects/FeedItem',
      body: {
        ParentId: caseId,
        Body: body,
        IsRichText: true,
        Type: 'TextPost',
        visibility: visibility
      }
    })
  }

  /**
   * Count list Cases
   * @memberOf SalesforceRepository
   * @param  {String[]} siteIds
   * @param  {Object} params
   * @param  {Object} params.filter
   * @return {Object} Case list
   */
  static countListCases(siteIds, params) {
    return this._findByQuery(this._generateCountListCasesQuery(siteIds, params))
  }

  /**
   * Get Case by id if it's assigned to one of the specified cites
   * @memberOf SalesforceRepository
   * @param  {String} salesforceCaseId
   * @return {Object} Case
   */
  static getCaseById(salesforceCaseId) {
    const { records } = this._findByQuery(this._generateSingleCaseQuery(salesforceCaseId))
    return records[0]
  }

  /**
   * Creates a Salesforce Case object
   *   - (Required for development) Create a c_site (Study_Site) at
   *   https://medable--devdcr.sandbox.lightning.force.com/lightning/o/Study_Site__c/new?count=4&nooverride=1&useRecordTypeCheck=1&navigationLocation=LIST_VIEW&backgroundContext=%2Flightning%2Fr%2FStudy_Site__c%2Fa2563000002sgCvAAI%2Fview
   *   - (Optional for development) Org can be created in Salesforce sandbox at
   *   the URL below and then associated with a Study_Site__c
   *   https://medable--devdcr.sandbox.lightning.force.com/lightning/o/Org__c/list?filterName=Recent
   *   - In production/dev/uat environments, orgs and sites are automatically
   *   pulled into Salesforce from BigQuery, and orgs are auto-associated with sites
   * @memberOf SalesforceRepository
   * @param  {Object} salesforceCaseInput
   * @return {Object} creation result
   */
  static createCase(salesforceCaseInput) {
    const body = {
      ...salesforceCaseInput,
      Origin: this._getOrigin(),
      OwnerId: this._getOwner(),
      RecordTypeId: this._getRecordTypeId(),
      SuppliedEmail: script.principal.email
    }
    return this._makeRequest({
      method: 'post',
      path: 'sobjects/Case',
      body
    })
  }

  /**
   * Update a Salesforce Case object
   * @memberOf SalesforceRepository
   * @param  {String} salesforceCaseId
   * @param  {Object} salesforceCaseInput
   * @return
   */
  static updateCase(salesforceCaseId, salesforceCaseInput) {
    this._makeRequest({
      method: 'patch',
      path: `sobjects/Case/${salesforceCaseId}`,
      body: salesforceCaseInput
    })
  }

  /**
   * Get owner config value
   * @memberOf SalesforceRepository
   * @return {String} owner
   */
  static _getOwner() {
    return config.get('dcr_intake__salesforce_owner')
  }

  /**
   * Get origin config value
   * @memberOf SalesforceRepository
   * @return {String} origin
   */
  static _getOrigin() {
    return config.get('dcr_intake__salesforce_origin')
  }

  /**
   * Get record type id config value
   * @memberOf SalesforceRepository
   * @return {String} record type id
   */
  static _getRecordTypeId() {
    return config.get('dcr_intake__salesforce_recordtypeid')
  }

}

module.exports = {
  SalesforceRepository
}