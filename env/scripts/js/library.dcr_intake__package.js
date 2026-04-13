/**
 * @fileOverview
 * @summary Entry point to DCR intake API
 *
 * @author Data Management Squad
 *
 * @example
 * const { DataChangeRequestIntakePackage } = require('dcr_intake__package')
 */

const { route, on, trigger } = require('decorators'),
      faults = require('c_fault_lib'),
      { isIdFormat } = require('util.id'),
      { DcrService } = require('dcr_intake__dcr_service'),
      { CommentService } = require('dcr_intake__comment_service'),
      { SsoService } = require('dcr_intake__sso_service'),
      { AuthService } = require('dcr_intake__auth_service'),
      { ProxyService } = require('dcr_intake__proxy_service'),
      { StepResponseService } = require('dcr_intake__step_response_service'),
      { TaskResponseService } = require('dcr_intake__task_response_service'),
      { BranchingLogicService } = require('dcr_intake__branching_logic_service'),
      { DcrExecutionRepository } = require('dcr_intake__dcr_execution_repository'),
      { VisitRepository } = require('dcr_intake__visit_repository'),
      { AccountService } = require('dcr_intake__account_service'),
      { PublicUserService } = require('dcr_intake__public_user_service'),
      { AutomatedChangeService } = require('dcr_intake__automated_change_service'),
      { DcrExecutionService } = require('dcr_intake__dcr_execution_service'),
      { SiteService } = require('dcr_intake__site_service'),
      { CaseRepository } = require('dcr_intake__case_repository'), 
      http = require('http'), 
      config = require('config'),
      querystring = require('qs'),
      logger = require('logger')

/**
 * Data Change Request Intake Package
 *
 * @class DataChangeRequestIntakePackage
 */

class DataChangeRequestIntakePackage {

  /**
   * Route to return a list of DCRs
   * @memberOf DataChangeRequestIntakePackage
   * @path {GET} /dcr_intake
   * @param  {Number} req.query.limit must be >= 0
   * @param  {Number} req.query.offset must be >=0
   * @param  {String} req.query.order_by must be one of: 'dcr_intake__number', 'dcr_intake__public_user_number', 'dcr_intake__type', 'dcr_intake__status', 'dcr_intake__last_modified_date'
   * @param  {String} req.query.order must be 'asc' or 'desc'
   * @param  {Object} req.query.filter
   * @response {DCRIntakeRequestList} simplified DCRIntakeRequest object list with metadata
   * @example
   * curl 'https://api-int-dev.medable.com/dcr_intake/v2/routes/dcr_intake'
   */
  @route('GET /dcr_intake', {
    name: 'dcr_intake_request_return_all'
  })
  static listDcrIntakeRequests({ req }) {
    AuthService.authorize([...AuthService.roleGroups.ANY, AuthService.roles.DCR_VIEW_ONLY])
    this._validateListDcrIntakeRequestsInput(req.query)
    return DcrService.listForLoggedInUser({
      limit: req.query.limit,
      offset: req.query.offset,
      orderBy: req.query.order_by,
      order: req.query.order,
      filter: req.query.filter
    })
  }

  /**
   * Route to return a single DCR
   * @memberOf DataChangeRequestIntakePackage
   * @path {GET} /dcr_intake/:salesforceCaseId
   * @params {String} :salesforceCaseId SalesForce id of the request (get all intakes to see what ids can be retrieved)
   * @response {DCRIntakeRequest} DCRIntakeRequest object
   * @example
   * curl 'https://api-int-dev.medable.com/dcr_intake/v2/routes/dcr_intake/5006300000CXGlUAAX'
   */
  @route('GET /dcr_intake/:salesforceCaseId', {
    name: 'dcr_intake_request_return'
  })
  static getDcrIntakeRequest({ req }) {
    AuthService.authorize([...AuthService.roleGroups.ANY, AuthService.roles.DCR_VIEW_ONLY])
    const { salesforceCaseId } = req.params
    this._validateDcrId(salesforceCaseId)
    return DcrService.getForLoggedInUser(salesforceCaseId)
  }

  /**
   * Route to return a comments list. Defaults to AllUsers visibility.
   * @memberOf DataChangeRequestIntakePackage
   * @path {GET} /dcr_intake/:salesforceCaseId/comments
   * @params {String} salesforceCaseId
   * @response {Object}
   * @example
   * curl 'https://api-int-dev.medable.com/dcr_intake/v2/routes/dcr_intake/5006300000CXGlUAAX/comments'
   */
  @route('GET /dcr_intake/:salesforceCaseId/comments', {
    name: 'dcr_intake_request_comments_return_all'
  })
  static getDcrIntakeRequestComments({ req }) {
    AuthService.authorize([...AuthService.roleGroups.ANY, AuthService.roles.DCR_VIEW_ONLY])
    const { salesforceCaseId } = req.params
    this._validateDcrId(salesforceCaseId)
    return CommentService.listForLoggedInUser(salesforceCaseId, {
      limit: 15,
      offset: 0
    })
  }

  /**
   * Route to create a comment
   * @memberOf DataChangeRequestIntakePackage
   * @path {POST} /dcr_intake/:salesforceCaseId/comments
   * @params {String} salesforceCaseId
   * @response {Object}
   */
  @route('POST /dcr_intake/:salesforceCaseId/comments', {
    name: 'dcr_intake_request_comments_create'
  })
  static createDcrIntakeRequestComment({ req, body }) {
    AuthService.authorize(AuthService.roleGroups.ANY)
    const { salesforceCaseId } = req.params,
          commentInput = body()
    this._validateDcrId(salesforceCaseId)
    this._validateCreateCommentInput(commentInput)
    return CommentService.createPublicForLoggedInUser(
      salesforceCaseId,
      commentInput.dcr_intake__comment_body
    )
  }

  /**
   * Route to change a status
   * @memberOf DataChangeRequestIntakePackage
   * @path {POST} /dcr_intake/:salesforceCaseId/comments
   * @params {String} salesforceCaseId
   */
  @route('POST /dcr_intake/:salesforceCaseId/status', {
    name: 'dcr_intake_request_status_change'
  })
  static changeDcrIntakeRequestStatus({ req, body }) {
    AuthService.authorize(AuthService.roleGroups.DATA_SERVICE_TEAM_ONLY)
    const { salesforceCaseId } = req.params,
          { dcr_intake__status } = body()
    this._validateDcrId(salesforceCaseId)
    this._validateChangeDcrIntakeRequestStatusInput({ dcr_intake__status })
    DcrService.changeStatusForLoggedInUser(salesforceCaseId, dcr_intake__status)
  }

  /**
   * Route to validate public user number
   * @memberOf DataChangeRequestIntakePackage
   * @path {POST} /dcr_intake/public_user_number_validations
   * @response {Object}
   */
  @route('POST /dcr_intake/public_user_number_validations', {
    name: 'dcr_intake_request_pu_number_validate'
  })
  static validatePublicUserNumber({ body }) {
    AuthService.authorize([...AuthService.roleGroups.ANY, AuthService.roles.DCR_VIEW_ONLY])
    const validationInput = body()
    this._validateValidatePublicUserNumberInput(validationInput)
    return PublicUserService.validateNumber(validationInput.number, validationInput.new_number)
  }

  /**
   * Route to create a DCR case in salesforce
   * See SalesforceDcrDTO class for potential fields
   * @memberOf DataChangeRequestIntakePackage
   * @path {POST} /dcr_intake
   * @params {String} :id SalesForce id of the request (get all intakes to see what ids can be retrieved)
   * @response {DCRIntakeRequestCreationResult} DCRIntakeRequest instance creation result
   * @example
   * curl -s -b cookies.txt -c cookies.txt -H "Content-Type: application/json" -H "medable-client-key: vVybcLtOU4fcrg8tEGnVrQ" --data ' {
        "dcr_desired_value__c": "Test from dcr intake api",
        "dcr_original_value__c": "Test description from dcr/sf connector",
        "dcr_type_of_change__c": "Move tasks to another visit"
      }' -X POST https://api-int-dev.medable.com/william-wan/v2/routes/dcr_intake
   */
  @route('POST /dcr_intake', {
    name: 'dcr_intake_request_create'
  })
  static createDcrRequest({ body }) {
    AuthService.authorize(AuthService.roleGroups.SITE_USER_ONLY)
    const { email, password, signer, code, ...createInput } = body()
    this._validateSignInput({ email, password, code, signer })
    this._validateCreateDcrInput(createInput)
    return DcrService.createForLoggedInUser(createInput, {
      email,
      code,
      signer
    })
  }

  /**
   * Route to create a DCR execution
   * @memberOf DataChangeRequestIntakePackage
   * @path {POST} /dcr_intake/executions
   * @response {DCRIntakeRequestCreateExecutionResult}
   */
  @route('POST /dcr_intake/executions', {
    name: 'dcr_intake_dcr_execution_create'
  })
  static createDcrExecution({ body }) {
    AuthService.authorize(AuthService.roleGroups.DATA_SERVICE_TEAM_ONLY)
    const { email, password, signer, code, ...executionInput } = body()
    this._validateSignInput({ email, password, code, signer })
    this._validateCreateExecutionInput(executionInput)
    return DcrExecutionService.signAndExecuteForLoggedInUser(executionInput, {
      email,
      code,
      signer
    })
  }

  /**
   * Route to sign the already existing Salesforce Case.
   * @memberOf DataChangeRequestIntakePackage
   * @path {POST} /dcr_intake/:id/signature
   * @params {String} :id SalesForce id of the request (get all intakes to see what ids can be retrieved)
   * @response {DCRIntakeRequestSignResult} success true
   * @example
   * curl -s -b cookies.txt -c cookies.txt -H "Content-Type: application/json" -H "medable-client-key: vVybcLtOU4fcrg8tEGnVrQ" --data ' {
        "email": "testemail@medable.com",
        "password": "testpassword"
      }' -X POST https://api-int-dev.medable.com/william-wan/v2/routes/dcr_intake/5006300000CXGlUAAX/signature
   */
  @route('POST /dcr_intake/:salesforceCaseId/signature', {
    name: 'dcr_intake_request_resign'
  })
  static signDcrIntakeRequest({ req, body }) {
    AuthService.authorize(AuthService.roleGroups.SITE_USER_ONLY)
    const { email, code, signer } = body(),
          { salesforceCaseId } = req.params
    this._validateSignInput(body())
    this._validateDcrId(salesforceCaseId)
    DcrService.resignForLoggedInUser(salesforceCaseId, {
      email,
      code,
      signer
    })
    return {
      success: true
    }
  }

  /**
   * Route to return the latest signature for the existing Salesforce Case.
   * @memberOf DataChangeRequestIntakePackage
   * @path {GET} /dcr_intake/:id/signature
   * @params {String} :id SalesForce id of the request (get all intakes to see what ids can be retrieved)
   * @response {DCRIntakeRequestSignature} signature
   * @example
   * curl https://api-int-dev.medable.com/william-wan/v2/routes/dcr_intake/5006300000CXGlUAAX/signature
   */
  @route('GET /dcr_intake/:salesforceCaseId/signature', {
    name: 'dcr_intake_request_signature_return'
  })
  static getLatestDcrIntakeRequestSignature({ req }) {
    AuthService.authorize([...AuthService.roleGroups.ANY, AuthService.roles.DCR_VIEW_ONLY])
    const { salesforceCaseId } = req.params
    this._validateDcrId(salesforceCaseId)
    return DcrService.getLatestSignatureForLoggedInUser(salesforceCaseId)
  }

  /**
   * Route to return visits list
   * @memberOf DataChangeRequestIntakePackage
   * @path {GET} /dcr_intake/visits
   * @response {Object} visits list
   * @example
   * curl https://api-int-dev.medable.com/william-wan/v2/routes/dcr_intake/visits
   */
  @route('GET /dcr_intake/visits', {
    weight: 1,
    name: 'dcr_intake_visits_return_all'
  })
  static getAllVisits() {
    AuthService.authorize([...AuthService.roleGroups.ANY, AuthService.roles.DCR_VIEW_ONLY])
    return VisitRepository.getAll()
  }

  /**
   * Route to return public user set dates list
   * @memberOf DataChangeRequestIntakePackage
   * @path {GET} /dcr_intake/public_users/:id/set_dates
   * @response {Object} set dates list
   * @example
   * curl https://api-int-dev.medable.com/william-wan/v2/routes/dcr_intake/public_users/:id/set_dates
   */
  @route('GET /dcr_intake/public_users/:id/set_dates', {
    weight: 1,
    name: 'get_dcr_intake_pu_id_set_dates'
  })
  static getPublicUserSetDates({ req }) {
    AuthService.authorize(AuthService.roleGroups.DATA_SERVICE_TEAM_ONLY)
    const { id } = req.params
    return PublicUserService.getSetDatesWithTemplates(id)
  }

    /**
   * Route to return task and step responses for a participant
   * @memberOf DataChangeRequestIntakePackage
   * @path {GET} /dcr_intake/public_users/task_responses/:id
   * @response {Object[]} Array of task responses with expanded step responses
   * @example
   * curl https://api-int-dev.medable.com/william-wan/v2/routes/dcr_intake/public_users/task_responses/:id
   */
    @route('GET /dcr_intake/public_users/task_responses/:id', {
      weight: 1,
      name: 'get_dcr_intake_pu_task_responses'
    })
    static getPublicUserTaskAndStepResponses({ req }) {
      AuthService.authorize(AuthService.roleGroups.ANY)
      const { id } = req.params
      return PublicUserService.getTaskandStepResponsesforParticipant(id)
    }

  @route('GET /dcr_intake/public_users/:id/visits', {
    weight: 1,
    name: 'dcr_intake_pu_visits'
  })
  static getPublicUserVisits({ req }) {
    AuthService.authorize([...AuthService.roleGroups.ANY, AuthService.roles.DCR_VIEW_ONLY])
    const { id } = req.params
    this._validatePublicUserId(id)
    return PublicUserService.getVisitsforParticipant(id)
  }

  @route('GET /dcr_intake/public_users/:publicUserId/visit/:visitId/site_task_responses', {
    weight: 1,
    name: 'dcr_intake_pu_site_task_responses'
  })
  static getSiteTaskResponsesForVisitForParticipant({ req }) {
    AuthService.authorize([...AuthService.roleGroups.ANY, AuthService.roles.DCR_VIEW_ONLY])
    const { publicUserId, visitId } = req.params
    this._validatePublicUserId(visitId)
    return TaskResponseService.getSiteResponsesForVisitForParticipant(visitId, publicUserId)
  }

  /**
   * Route to return activities for a participant
   * @memberOf DataChangeRequestIntakePackage
   * @path {GET} /dcr_intake/public_users/:id/activities
   * @params {String} :id Public user ID
   * @response {Object[]} Array of activities assigned to the participant
   * @example
   * curl https://api-int-dev.medable.com/william-wan/v2/routes/dcr_intake/public_users/:id/activities
   */
  @route('GET /dcr_intake/public_users/:id/activities', {
    weight: 1,
    name: 'dcr_intake_pu_activities'
  })
  static getPublicUserActivities({ req }) {
    AuthService.authorize([...AuthService.roleGroups.ANY, AuthService.roles.DCR_VIEW_ONLY])
    const { id } = req.params
    this._validatePublicUserId(id)
    return PublicUserService.getActivitiesForParticipant(id)
  }

    /**
     * Route to return task responses for an activity
     * @memberOf DataChangeRequestIntakePackage
     * @path {GET} /dcr_intake/activities/:id/task_responses
     * @params {String} :id Activity ID
     * @query {String} participantId Participant ID to filter task responses
     * @response {Object[]} Array of task responses for the activity
     * @example
     * curl https://api-int-dev.medable.com/william-wan/v2/routes/dcr_intake/activities/:id/task_responses?participantId=123
     */
    @route('GET /dcr_intake/activities/:id/task_responses', {
      weight: 1,
      name: 'dcr_intake_activity_task_responses'
    })
    static getActivityTaskResponses({ req }) {
      AuthService.authorize([...AuthService.roleGroups.ANY, AuthService.roles.DCR_VIEW_ONLY])
      const { id } = req.params
      const { participantId } = req.query
      this._validateActivityId(id)
      if (participantId) {
        this._validatePublicUserId(participantId)
      }
      return TaskResponseService.getTaskResponsesForActivity(id, participantId)
    }

  /**
   * Route to return screens/steps for a task response
   * @memberOf DataChangeRequestIntakePackage
   * @path {GET} /dcr_intake/task_responses/:id/screens
   * @params {String} :id Task response ID
   * @response {Object[]} Array of screens/steps for the task response
   * @example
   * curl https://api-int-dev.medable.com/william-wan/v2/routes/dcr_intake/task_responses/:id/screens
   */
  @route('GET /dcr_intake/task_responses/:id/screens', {
    weight: 1,
    name: 'dcr_intake_task_response_screens'
  })
  static getTaskResponseScreens({ req }) {
    AuthService.authorize([...AuthService.roleGroups.ANY, AuthService.roles.DCR_VIEW_ONLY])
    const { id } = req.params
    this._validateTaskResponseId(id)
    return TaskResponseService.getScreensForTaskResponse(id)
  }

  /**
   * Route to return step responses
   * @memberOf DataChangeRequestIntakePackage
   * @path {GET} /dcr_intake/step_responses
   * @response {Object[]} step responses
   * @example
   * curl https://api-int-dev.medable.com/william-wan/v2/routes/dcr_intake/step_responses
   */
  @route('GET /dcr_intake/step_responses', {
    weight: 1,
    name: 'dcr_intake_step_responses_return'
  })
  static findStepResponsesForLoggedInUser({ req }) {
    AuthService.authorize([...AuthService.roleGroups.ANY, AuthService.roles.DCR_VIEW_ONLY])
    const query = {
      ...req.query,
      ...(req.query.where && { where: JSON.parse(req.query.where) })
    }
    this._validateFindStepResponsesInput(query)
    return StepResponseService.findForLoggedInUser(query.where, query.expand)
  }

  /**
   * Route to return task responses
   * @memberOf DataChangeRequestIntakePackage
   * @path {GET} /dcr_intake/task_responses
   * @response {Object[]} task responses
   * @example
   * curl https://api-int-dev.medable.com/william-wan/v2/routes/dcr_intake/task_responses
   */
  @route('GET /dcr_intake/task_responses', {
    weight: 1,
    name: 'dcr_intake_task_responses_return'
  })
  static findTaskResponsesForLoggedInUser({ req }) {
    AuthService.authorize([...AuthService.roleGroups.ANY, AuthService.roles.DCR_VIEW_ONLY])
    const query = {
      ...req.query,
      ...(req.query.where && { where: JSON.parse(req.query.where) })
    }
    this._validateFindTaskResponsesInput(query)
    return TaskResponseService.findForLoggedInUser(query.where, query.expand)
  }

  /**
   * Route to return affected steps for branching logic analysis
   * @memberOf DataChangeRequestIntakePackage
   * @path {GET} /dcr_intake/branching_logic/affected_steps
   * @params {String} req.query.task_response_id
   * @response {Object} analysis result
   */
  @route('GET /dcr_intake/branching_logic/affected_steps', {
    weight: 1,
    name: 'dcr_intake_branching_logic_steps'
  })
  static getBranchingLogicAffectedSteps({ req }) {
    AuthService.authorize([...AuthService.roleGroups.ANY, AuthService.roles.DCR_VIEW_ONLY])
    const { task_response_id } = req.query
    this._validateBranchingLogicAffectedStepsInput({ task_response_id })
    return BranchingLogicService.getAffectedStepsForChange(task_response_id)
  }

  /**
   * Route to return sites list
   * @memberOf DataChangeRequestIntakePackage
   * @path {GET} /dcr_intake/sites
   * @response {Object} sites list
   * @example
   * curl https://api-int-dev.medable.com/william-wan/v2/routes/dcr_intake/sites
   */
  @route('GET /dcr_intake/sites', {
    weight: 1,
    name: 'dcr_intake_sites_return_all'
  })
  static getSites() {
    AuthService.authorize([...AuthService.roleGroups.ANY, AuthService.roles.DCR_VIEW_ONLY])
    return SiteService.findForLoggedInUser()
  }

  /**
   * Redirect to cortex api GET /sso/oidc/login with callback to GET /dcr_intake/sso_code/callback
   * @memberOf DataChangeRequestIntakePackage
   * @path {GET} /dcr_intake/sso_code
   */
  @route('GET /dcr_intake/sso_code', {
    weight: 1,
    name: 'dcr_intake_sso_code_create',
    apiKey: 'dcr_intake__app',
    acl: [
      'account.anonymous'
    ]
  })
  static initSsoCodeCreation({ req, res }) {
    const url = SsoService.buildSsoCodeCallbackUrl(req.host, req.query.return_to)
    res.redirect(url)
  }

  /**
   * Redirect to return_to url provided to GET /dcr_intake/sso_code with generated code that was added to query parameters
   * @memberOf DataChangeRequestIntakePackage
   * @path {GET} /dcr_intake/sso_code/callback
   */
  @route('GET /dcr_intake/sso_code/callback', {
    weight: 1,
    name: 'dcr_intake_sso_code_create_callback',
    apiKey: 'dcr_intake__app',
    acl: [
      'account.anonymous'
    ]
  })
  static createSsoCode({ req, res }) {
    const url = SsoService.generateSsoCodeAndPrepareReturnUrl(req.query.return_to, {
      error: req.query.error,
      error_description: req.query.error_description
    })
    res.redirect(url)
  }

  /**
   * Route to return public user
   * @memberOf DataChangeRequestIntakePackage
   * @path {GET} /dcr_intake/sites
   * @response {Object} sites list
   * @example
   * curl https://api-int-dev.medable.com/william-wan/v2/routes/dcr_intake/sites/637f5d0d94481453bc08da10/public_users
   */
  @route('GET /dcr_intake/sites/:siteId/public_users', {
    weight: 1,
    name: 'dcr_intake_sites_id_public_users'
  })
  static getPublicUsers({ req }) {
    AuthService.authorize([...AuthService.roleGroups.ANY, AuthService.roles.DCR_VIEW_ONLY])
    const { siteId } = req.params
    const query = {
      ...req.query,
      ...(req.query.where && { where: JSON.parse(req.query.where) })
    }
    this._validateGetPublicUsers(query)
    return PublicUserService.findForLoggedInUser(siteId, query.where, query.expand)
  }

  @route('* /dcr_intake/v2/*', {
    weight: 1,
    name: 'dcr_intake_proxy'
  })
  static proxy({ req, body }) {
    return ProxyService.proxy({
      body: body(),
      path: req.params['0'],
      query: req.query,
      method: req.method,
      principal: script.principal
    })
  }

  /**
   * Validate input for GET /dcr_intake/sites/:siteId/public_users
   * @memberOf DataChangeRequestIntakePackage
   * @param {Object=} findInput
   * @param {Object=} findInput.where
   * @param {String[]=} findInput.expand
   * @return {void}
   */
  static _validateGetPublicUsers({ where, expand }) {
    if (expand && (
      !Array.isArray(expand) ||
      !expand.every(item => ['c_set_patient_flags.c_flag'].includes(item))
    )) {
      faults.throw('dcr_intake.invalidArgument.expand')
    }

    if (where) {
      if (!Object.keys(where)
        .every(key => ['c_number', '_id'].includes(key))) {
        faults.throw('dcr_intake.invalidArgument.where')
      }
    }
  }

  /**
   * Event to execute an automated data change.
   * @memberOf Package
   * @param {Object} eventInfo automated dcr details
   */
  @on('dcr_intake__automated_change')
  static executeDataChange(eventInfo) {
    AutomatedChangeService.triggerAutomatedChange(eventInfo.executionId)
  }

  /**
   * Validate query for GET /dcr_intake
   * @memberOf DataChangeRequestIntakePackage
   * @param  {Object} query
   * @return
   */
  static _validateListDcrIntakeRequestsInput(query) {
    const { order, order_by, limit, offset, filter } = query

    if (order && !['asc', 'desc'].includes(order)) {
      faults.throw('dcr_intake.invalidArgument.order')
    }

    if (
      order_by &&
      ![
        'dcr_intake__number',
        'dcr_intake__public_user_number',
        'dcr_intake__type',
        'dcr_intake__status',
        'dcr_intake__last_modified_date'
      ].includes(order_by)
    ) {
      faults.throw('dcr_intake.invalidArgument.order_by')
    }

    if (limit && (Number.isNaN(Number(limit)) || Number(limit) < 0)) {
      faults.throw('dcr_intake.invalidArgument.limit')
    }

    if (offset && (Number.isNaN(Number(offset)) || Number(offset) < 0)) {
      faults.throw('dcr_intake.invalidArgument.offset')
    }

    if (filter) {
      for (const key in filter) {
        if (!CaseRepository.listFilterFields[key]) {
          faults.throw('dcr_intake.invalidArgument.filter')
        }
      }
    }
  }

  /**
   * Validate dcr create input
   * @memberOf DataChangeRequestIntakePackage
   * @param  {Object} caseInput DCRIntakeRequest input
   * @return
   */
  static _validateCreateDcrInput(caseInput) {
    const {
      dcr_intake__site_id,
      dcr_intake__public_user_number,
      dcr_intake__type
    } = caseInput
    if (!isIdFormat(dcr_intake__site_id)) {
      faults.throw('dcr_intake.invalidArgument.dcr_intake__site_id')
    }
    if (!dcr_intake__public_user_number) {
      faults.throw('dcr_intake.invalidArgument.dcr_intake__public_user_number')
    }
    if (!dcr_intake__type) {
      faults.throw('dcr_intake.invalidArgument.dcr_intake__type')
    }
  }

  /**
   * Validate input for GET /dcr_intake/step_responses
   * @memberOf DataChangeRequestIntakePackage
   * @param {Object=} findInput
   * @param {Object=} findInput.where
   * @param {String[]=} findInput.expand
   * @return {void}
   */
  static _validateFindStepResponsesInput(findInput) {
    const { where, expand } = findInput
    if (expand && (
      !Array.isArray(expand) ||
      !expand.every(item => ['c_task', 'c_step', 'c_step.c_allow_multiples'].includes(item))
    )) {
      faults.throw('dcr_intake.invalidArgument.expand')
    }
    if (where) {
      if (!Object.keys(where)
        .every(key => ['c_public_user', 'type', 'c_task_response'].includes(key))) {
        faults.throw('dcr_intake.invalidArgument.where')
      }
      const { c_public_user, type, c_task_response } = where
      if (c_public_user && !isIdFormat(where.c_public_user)) {
        faults.throw('dcr_intake.invalidArgument.where')
      }
      if (c_task_response && !isIdFormat(where.c_task_response)) {
        faults.throw('dcr_intake.invalidArgument.where')
      }
      if (type && (
        typeof type !== 'object' ||
        !Array.isArray(type.$in) ||
        !type.$in.every(item => ['c_datetime', 'c_date', 'c_text', 'c_numeric', 'c_boolean', 'c_text_choice'].includes(item))
      )) {
        faults.throw('dcr_intake.invalidArgument.where')
      }
    }
  }

  /**
   * Validate endpoint input
   * @memberOf DataChangeRequestIntakePackage
   * @param {Object} input
   * @return
   */
  static _validateValidatePublicUserNumberInput(input) {
    const { number, new_number } = input
    if (!number) {
      faults.throw('dcr_intake.invalidArgument.number')
    }
    if (!new_number || number === new_number) {
      faults.throw('dcr_intake.invalidArgument.new_number')
    }
  }

  /**
   * Validate dcr intake request sign input
   * @memberOf DataChangeRequestIntakePackage
   * @param  {Object} signInput DCRIntakeRequest sign input
   * @return
   */
  static _validateSignInput(signInput) {
    const { email, password, code, signer } = signInput
    const { c_pinned_version } = org.objects.c_study.find().next()
    if (!code) {
      if (!email) {
        faults.throw('dcr_intake.invalidArgument.email')
      }
      if (!password) {
        faults.throw('dcr_intake.invalidArgument.password')
      }

      if (c_pinned_version >= 40000) {
        const authResponse = http.post(this._formAuthURL(), {
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email, 
            password
          })
        })

        if (![200, 201].includes(authResponse.statusCode)) {
          faults.throw('dcr_intake.accessDenied.invalidCredentials')
        }
      } else {
        AccountService.verifyCredentials(email, password)
      }
    } else {
      const isCodeValid = SsoService.checkIfSsoCodeValid(code)
      if (!isCodeValid) {
        faults.throw('dcr_intake.invalidArgument.code')
      }
    }
    if (!signer) {
      faults.throw('dcr_intake.invalidArgument.signer')
    }
  }

  static _formAuthURL() {
    const envMapping = config.get('dcr_intake__iam_urls')
    const currentEnvironment = script.env.host

    if (currentEnvironment === 'api.local.medable.com') {
      return `https://iam.local.medable.com/v1/login`
    }

    if (envMapping[currentEnvironment] === 'production') {
      return `https://auth.medable.com/v1/login`
    }

    return `https://auth-${envMapping[currentEnvironment]}.medable.com/v1/login`
  }

  /**
   * Validate dcr id
   * @memberOf DataChangeRequestIntakePackage
   * @param {String} id
   * @return
   */
  static _validateDcrId(id) {
    if (!/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/gi.test(id)) {
      faults.throw('dcr_intake.notFound.dataChangeRequest')
    }
  }

  /**
   * Validate dcr intake sign input
   * @memberOf DataChangeRequestIntakePackage
   * @param {Object} commentInput
   * @return
   */
  static _validateCreateCommentInput(commentInput) {
    const { dcr_intake__comment_body } = commentInput
    if (!dcr_intake__comment_body) {
      faults.throw('dcr_intake.invalidArgument.dcr_intake__comment_body')
    }
  }

  /**
   * Validate dcr intake execution input
   * @memberOf DataChangeRequestIntakePackage
   * @param {Object} executionInput
   * @return
   */
  static _validateCreateExecutionInput(executionInput) {
    const {
      dcr_intake__type,
      dcr_intake__case_id,
      dcr_intake__changes
    } = executionInput
    const isTypeExist = Object.values(DcrExecutionRepository.types)
      .find(t => t === dcr_intake__type)
    if (!isTypeExist) {
      faults.throw('dcr_intake.invalidArgument.dcr_intake__type')
    }
    if (!dcr_intake__case_id) {
      faults.throw('dcr_intake.invalidArgument.dcr_intake__case_id')
    }
    switch (dcr_intake__type) {
      case DcrExecutionRepository.types.REGENERATE_ANCHOR_DATE_EVENTS:
        if (
          !dcr_intake__changes ||
            !dcr_intake__changes.dcr_intake__anchor_date_template_id ||
            !dcr_intake__changes.dcr_intake__date
        ) {
          faults.throw('dcr_intake.invalidArgument.dcr_intake__changes')
        }
        // only required to bypass trigger.c_public_user_before_set_dates.js in axon
        // any value could be passed as the value itself is not used anywhere and should just be there
        if (!executionInput.audit || !executionInput.audit.message) {
          faults.throw('dcr_intake.invalidArgument.auditMessage')
        }
        break
      case DcrExecutionRepository.types.UNSET_ANCHOR_DATE_TEMPLATE:
        if (
          !dcr_intake__changes ||
            !dcr_intake__changes.dcr_intake__anchor_date_template_id
        ) {
          faults.throw('dcr_intake.invalidArgument.dcr_intake__changes')
        }
        break
      case DcrExecutionRepository.types.UPDATE_STEP_RESPONSE:
        if (
          !dcr_intake__changes ||
          !dcr_intake__changes.dcr_intake__step_response_id ||
          dcr_intake__changes.dcr_intake__desired_value === undefined
        ) {
          faults.throw('dcr_intake.invalidArgument.dcr_intake__changes')
        }
        break
      case DcrExecutionRepository.types.RESET_PATIENT_FLAG:
        if (
          !dcr_intake__changes ||
          !dcr_intake__changes.dcr_intake__set_patient_flag_id
        ) {
          faults.throw('dcr_intake.invalidArgument.dcr_intake__changes')
        }
        break
      default:
        break
    }
  }

  /**
   * Validate dcr intake status input
   * @memberOf DataChangeRequestIntakePackage
   * @param {Object} statusInput
   * @param {String} statusInput.dcr_intake__status
   * @return
   */
  static _validateChangeDcrIntakeRequestStatusInput({ dcr_intake__status }) {
    if (!dcr_intake__status || !Object.values(CaseRepository.statuses)
      .includes(dcr_intake__status)) {
      faults.throw('dcr_intake.invalidArgument.dcr_intake__status')
    }
  }

  /**
   * Validate input for GET /dcr_intake/task_responses
   * @memberOf DataChangeRequestIntakePackage
   * @param {Object=} findInput
   * @param {Object=} findInput.where
   * @param {String[]=} findInput.expand
   * @return {void}
   */
  static _validateFindTaskResponsesInput(findInput = {}) {
    const { where, expand } = findInput
    if (expand && (
      !Array.isArray(expand) ||
        !expand.every(item => ['c_task', 'c_visit'].includes(item))
    )) {
      faults.throw('dcr_intake.invalidArgument.expand')
    }
    if (where) {
      if (!Object.keys(where)
        .every(key => ['c_public_user', 'c_visit'].includes(key))) {
        faults.throw('dcr_intake.invalidArgument.where')
      }
      const { c_public_user, c_visit } = where
      if (c_public_user && !isIdFormat(c_public_user)) {
        faults.throw('dcr_intake.invalidArgument.where')
      }
      if (c_visit && !isIdFormat(c_visit)) {
        faults.throw('dcr_intake.invalidArgument.where')
      }
    }
  }

  /**
   * Validate input for GET /dcr_intake/branching_logic/affected_steps
   * @memberOf DataChangeRequestIntakePackage
   * @param {Object} input
   * @param {String} input.task_response_id
   * @return {void}
   */
  static _validateBranchingLogicAffectedStepsInput({ task_response_id }) {
    if (!task_response_id || !isIdFormat(task_response_id)) {
      faults.throw('dcr_intake.invalidArgument.task_response_id')
    }
  }

  /**
   * Validate public user ID for GET /dcr_intake/public_users/:id/activities
   * @memberOf DataChangeRequestIntakePackage
   * @param {String} id Public user ID
   * @return {void}
   */
  static _validatePublicUserId(id) {
    if (!id || !isIdFormat(id)) {
      faults.throw('dcr_intake.invalidArgument.public_user_id')
    }
  }

  /**
   * Validate activity ID for GET /dcr_intake/activities/:id/task_responses
   * @memberOf DataChangeRequestIntakePackage
   * @param {String} id Activity ID
   * @return {void}
   */
  static _validateActivityId(id) {
    if (!id || !isIdFormat(id)) {
      faults.throw('dcr_intake.invalidArgument.activity_id')
    }
  }

  /**
   * Validate task response ID for GET /dcr_intake/task_responses/:id/screens
   * @memberOf DataChangeRequestIntakePackage
   * @param {String} id Task response ID
   * @return {void}
   */
  static _validateTaskResponseId(id) {
    if (!id || !isIdFormat(id)) {
      faults.throw('dcr_intake.invalidArgument.task_response_id')
    }
  }

  @trigger('create.after', { object: 'c_site', weight: 1 })
  static siteAfterCreate({ new: newSite }) {
    // Only run in non-production environments
    const DEV_HOSTS = [
      'api.qa.medable.com',
      'api-int-dev.medable.com',
      'api-eu1-dev.medable.com',
      'api.dev.medable.cn',
      'api.dev.medable.com',
      'api.local.medable.com',
      'api.test.medable.com',
      'api.platform.medable.cn'
    ]

    const SALESFORCE_CREDENTIALS = config.get('dcr_intake__salesforce_auth_credentials')

    if (!DEV_HOSTS.includes(script.env.host)) {
      return
    }

    try {
      const authResponse = http.post(
        `${SALESFORCE_CREDENTIALS.baseUrl}?${querystring.stringify(SALESFORCE_CREDENTIALS.params)}`
      )
      const authData = JSON.parse(authResponse.body)

      const response = http.post(
        `${authData.instance_url}/services/data/v56.0/sobjects/Study_Site__c`,
        {
          headers: {
            Authorization: `Bearer ${authData.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            Site_Id_External__c: newSite._id,
            Name__c: newSite.c_name,
            Medable_Site_Number__c: newSite.c_number
          })
        }
      )

      const result = JSON.parse(response.body)

      if (result.id) {
        logger.info(`Site ${newSite._id} successfully added to Salesforce`)
      } else if (result[0] && result[0].errorCode) {
        if (result[0].errorCode === 'DUPLICATE_VALUE') {
          logger.info(`Site ${newSite._id} already exists in Salesforce`)
        } else {
          logger.warn(`Failed to add site ${newSite._id} to Salesforce: ${result[0].message}`)
        }
      }
    } catch (error) {
      logger.warn(`Error creating site ${newSite._id} in Salesforce: ${error.message}`)
    }
  }

}

module.exports = {
  DataChangeRequestIntakePackage
}