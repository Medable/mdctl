/**
 * DO NOT CUSTOMIZE THIS FILE!
 * Upgrading the integrations-platform package version will overwrite any changes.
 */

import {
  as,
  log,
  route,
  trigger,
} from 'decorators';
import Pipeline from 'int__pipeline';
import Utils from 'int__utils';

const { isIdFormat } = require('util.id');
const IntFaults = require('int__faults');

/**
 * @classdesc Endpoint Vendor routes and triggers
 * @class
 */
class EndptVendor {

  static VENDOR = 'int__endpt';

  /*
   *  ___          _
   * | _ \___ _  _| |_ ___ ___
   * |   / _ \ || |  _/ -_|_-<
   * |_|_\___/\_,_|\__\___/__/
   */

  /**
   * @ignore
   * @swagger
   * components:
   *   securitySchemes:
   *     EndpointBasicAuth:
   *       type: http
   *       scheme: basic
   */
  @log({ traceResult: true, traceError: true })
  @route('* /int/v1/endpoint/*', {
    acl: ['account.anonymous'],
    apiKey: 'int__platform',
    priority: 999,
  })
  @as('c_system_user', {
    safe: false,
    principal: { skipAcl: true, grant: 'read' },
  })
  static validateRequest({ req, body, res, next }) {
    if (req.path !== '/routes/int/v1/endpoint/config' && req.path !== '/routes/int/v1/endpoint/ping') {
      const validationResponse = this.validateAuthToken(req, body());

      if (validationResponse.error === true) {
        const ResponseData = validationResponse.result.ResponseData;
        res.setStatusCode(ResponseData.ResponseCode);
        return {
          object: 'result',
          data: {
            ResponseData,
          },
        };
      };
    }
    next();
  }

  /**
   * @ignore
   * @swagger
   * /routes/int/v1/endpoint/config:
   *   put:
   *     summary: Endpoint Config Route
   *     description: Updates the Endpoint integration config
   *     tags:
   *       - Endpoint
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               enabled:
   *                 type: boolean
   *               pipelines:
   *                 type: array
   *                 items:
   *                   properties:
   *                     c_task:
   *                       type: array
   *                     int__enabled:
   *                       type: boolean
   *                     int__identifier:
   *                       type: string
   *               secrets:
   *                 type: array
   *                 items:
   *                   properties:
   *                     int__identifier:
   *                       type: string
   *                     int__value:
   *                       type: string
   *           examples:
   *             Endpoint Config:
   *               value:
   *                 enabled: true
   *                 pipelines:
   *                   - int__enabled: true
   *                     int__identifier: int__endpt_admin
   *                   - int__enabled: true
   *                     int__identifier: int__endpt_ping
   *                   - int__enabled: true
   *                     int__identifier: int__endpt_sub_assess_task
   *                     c_task:  ["cef306bb-5eb4-48ef-ae4c-84b128f2962b"]
   *                   - int__enabled: true
   *                     int__identifier: int__endpt_sub_random_task
   *                     c_task: ""
   *                   - int__enabled: true
   *                     int__identifier: int__endpt_sub_reconsent_task
   *                     c_task:  ["cef306bb-5eb4-48ef-ae4c-84b128f2962b","0806c493-9fc8-4a7f-9d0a-6fdfe0153c3d"]
   *                   - int__enabled: true
   *                     int__identifier: int__endpt_sub_reg_ec
   *                   - int__enabled: true
   *                     int__identifier: int__endpt_sub_reg_task
   *                     c_task: ""
   *                   - int__enabled: true
   *                     int__identifier: int__endpt_sub_stat_update_task
   *                     c_task: ""
   *                   - int__enabled: true
   *                     int__identifier: int__endpt_sub_stat_update
   *                     c_task: ""
   *                 secrets:
   *                   - int__identifier: int__endpt_access_token
   *                     int__value: ""
   *                   - int__identifier: int__endpt_auth_password
   *                     int__value: ""
   *                   - int__identifier: int__endpt_auth_username
   *                     int__value: ""
   *                   - int__identifier: int__endpt_base_url
   *                     int__value: ""
   *                   - int__identifier: int__endpt_sponsor
   *                     int__value: ""
   *                   - int__identifier: int__endpt_study_protocol
   *                     int__value: ""
   *     responses:
   *       200:
   *         description: OK
   *       401:
   *         description: Unauthorized
   *       400:
   *         description: Bad Request
   */
  @log({ traceResult: true, traceError: true })
  @route('PUT /int/v1/endpoint/config', {
    acl: 'role.administrator',
    apiKey: 'int__platform',
  })
  @as('c_system_user', {
    safe: false,
    principal: { skipAcl: true, grant: 'read' },
  })
  static config({ body }) {

    const {
      enabled,
      pipelines = [],
      secrets = [],
    } = body();

    return Utils.configRoute({
      vendor: EndptVendor.VENDOR,
      enabled,
      pipelines,
      secrets,
    });
  }

  /**
   * @ignore
   * @swagger
   * /routes/int/v1/endpoint/ping:
   *   get:
   *     summary: Endpoint Ping Route
   *     description: Gets the environment, protocol and site data from Endpoint
   *     tags:
   *       - Endpoint
   *     responses:
   *       200:
   *         description: OK
   *       401:
   *         description: Unauthorized
   *       400:
   *         description: Bad Request
   */
  @log({ traceResult: true, traceError: true })
  @route('GET /int/v1/endpoint/ping', {
    acl: 'role.administrator',
    apiKey: 'int__platform',
  })
  @as('c_system_user', {
    safe: false,
    principal: { skipAcl: true, grant: 'read' },
  })
  static ping({ body, res } = {}) {
    const validateFeature = this.validateFeature('int__endpt_ping', body ? body() : null);

    if (validateFeature.error) {
      const ResponseData = validateFeature.result.ResponseData;
      res && res.setStatusCode(ResponseData.ResponseCode);
      return this.returnRes(ResponseData);
    }

    const response = new Pipeline('int__endpt_ping')
      .process();

    res && res.setStatusCode(response.statusCode || response.ResponseCode);
    return response.body || this.returnRes(response);
  }

  /**
   * @ignore
   * @swagger
   * /routes/int/v1/endpoint/administration:
   *   post:
   *     summary: Endpoint Administration Route
   *     description: Gets the environment, protocol and sites data
   *     tags:
   *       - Endpoint
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     security:
   *       - EndpointBasicAuth: []
   *     responses:
   *       200:
   *         description: OK
   *       401:
   *         description: Unauthorized
   *       400:
   *         description: Bad Request
   */
  @log({ traceResult: true, traceError: true })
  @route('GET /int/v1/endpoint/administration', {
    acl: 'account.anonymous',
    apiKey: 'int__platform',
  })
  @as('c_system_user', {
    safe: false,
    principal: { skipAcl: true, grant: 'read' },
  })
  static administration({ body, res }) {
    const validateFeature = this.validateFeature('int__endpt_admin', body());

    if (validateFeature.error) {
      const ResponseData = validateFeature.result.ResponseData;
      res.setStatusCode(ResponseData.ResponseCode);
      return this.returnRes(ResponseData);
    }

    const response = new Pipeline('int__endpt_admin')
      .process();

    res.setStatusCode(response.statusCode || response.ResponseCode);
    return response.body || this.returnRes(response);
  }

  /**
   * @ignore
   * @swagger
   * /routes/int/v1/endpoint/rescreen:
   *   post:
   *     summary: Endpoint Rescreen Route
   *     description: Rescreen a subject
   *     tags:
   *       - Endpoint
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               SubjectRescreenEvent:
   *                 type: object
   *                 properties:
   *                   GeneralData:
   *                     type: object
   *                     properties:
   *                       MessageID:
   *                         type: string
   *                       Protocol:
   *                         type: string
   *                       UserName:
   *                         type: string
   *                       TransactionID:
   *                         type: string
   *                       TransactionDateTime:
   *                         type: string
   *                   SubjectRescreenData:
   *                     type: object
   *                     properties:
   *                       SiteNumber:
   *                         type: string
   *                       PatientNumber:
   *                         type: string
   *                       VisitName:
   *                         type: string
   *                       VisitDate:
   *                         type: string
   *                       MedableSubjectID:
   *                         type: string
   *           examples:
   *             Endpoint Rescreen:
   *               value:
   *                 SubjectRescreenEvent:
   *                   GeneralData:
   *                     MessageID: "4F9ACCA9-2C36-4D15-A40A-59E824B1961D"
   *                     Protocol: "Medable Prototype I"
   *                     UserName: "endpointAPIUser"
   *                     TransactionID: "4F9ACCA9-2C36-4D15-A40A-59E824B1961D"
   *                     TransactionDateTime: "2022-01-21T14:52:44.237Z"
   *                   SubjectRescreenData:
   *                     SiteNumber: "100"
   *                     PatientNumber: "S100-1854"
   *                     VisitName: "Subject Rescreen"
   *                     VisitDate: "2022-01-21T05:00:00.000Z"
   *                     MedableSubjectID: "61eab56d52c7cd0100e83547"
   *     security:
   *       - EndpointBasicAuth: []
   *     responses:
   *       200:
   *         description: OK
   *       401:
   *         description: Unauthorized
   *       400:
   *         description: Bad Request
   */
  @log({ traceResult: true, traceError: true })
  @route('POST /int/v1/endpoint/rescreen', {
    acl: 'account.anonymous',
    apiKey: 'int__platform',
  })
  @as('c_system_user', {
    safe: false,
    principal: { skipAcl: true, grant: 'update' },
  })
  static rescreen({ body, res }) {
    const validateFeature = this.validateFeature('int__endpt_sub_rescreen', body());

    if (validateFeature.error) {
      const ResponseData = validateFeature.result.ResponseData;
      res.setStatusCode(ResponseData.ResponseCode);
      return this.returnRes(ResponseData);
    }

    const validationResponse = this.validateRequestStatusUpdateEndpoint(body());

    if (validationResponse.error === true) {
      const ResponseData = validationResponse.result.ResponseData;
      res.setStatusCode(ResponseData.ResponseCode);
      return this.returnRes(ResponseData);
    };

    const response = new Pipeline('int__endpt_sub_rescreen')
      .process(body());

    res.setStatusCode(response.statusCode || response.ResponseCode);
    return response.body || this.returnRes(response);
  }

  /**
   * @ignore
   * @swagger
   * /routes/int/v1/endpoint/status-update:
   *   post:
   *     summary: Endpoint Status Update Route
   *     description: Update the status of a subject
   *     tags:
   *       - Endpoint
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               SubjectStatusUpdateEvent:
   *                 type: object
   *                 properties:
   *                   GeneralData:
   *                     type: object
   *                     properties:
   *                       MessageID:
   *                         type: string
   *                       Protocol:
   *                         type: string
   *                       UserName:
   *                         type: string
   *                       TransactionID:
   *                         type: string
   *                       TransactionDateTime:
   *                         type: string
   *                   SubjectStatusUpdateData:
   *                     type: object
   *                     properties:
   *                       SiteNumber:
   *                         type: string
   *                       PatientNumber:
   *                         type: string
   *                       NewSubjectStatus:
   *                         type: string
   *                       SubjectStatusUpdateVisitDate:
   *                         type: string
   *                       MedableSubjectID:
   *                         type: string
   *           examples:
   *             Endpoint Status Update:
   *               value:
   *                 SubjectStatusUpdateEvent:
   *                   GeneralData:
   *                     MessageID: "4F9ACCA9-2C36-4D15-A40A-59E824B1961D"
   *                     Protocol: "Medable Prototype I"
   *                     UserName: "endpointAPIUser"
   *                     TransactionID: "4F9ACCA9-2C36-4D15-A40A-59E824B1961D"
   *                     TransactionDateTime: "2022-01-21T14:52:44.237Z"
   *                   SubjectStatusUpdateData:
   *                     SiteNumber: "100"
   *                     PatientNumber: "S100-1854"
   *                     NewSubjectStatus: "Screen-Fail"
   *                     SubjectStatusUpdateVisitDate: "2022-01-21T05:00:00.000Z"
   *                     MedableSubjectID: "61eab56d52c7cd0100e83547"
   *     security:
   *       - EndpointBasicAuth: []
   *     responses:
   *       200:
   *         description: OK
   *       401:
   *         description: Unauthorized
   *       400:
   *         description: Bad Request
  */
  @log({ traceResult: true, traceError: true })
  @route('POST /int/v1/endpoint/status-update', {
    acl: 'account.anonymous',
    apiKey: 'int__platform',
  })
  @as('c_system_user', {
    safe: false,
    principal: { skipAcl: true, grant: 'update' },
  })
  static statusUpdate({ body, res }) {

    const validateFeature = this.validateFeature('int__endpt_sub_stat_update', body());

    if (validateFeature.error) {
      const ResponseData = validateFeature.result.ResponseData;
      res.setStatusCode(ResponseData.ResponseCode);
      return this.returnRes(ResponseData);
    }

    const validationResponse = this.validateRequestStatusUpdateEndpoint(body());

    if (validationResponse.error === true) {
      const ResponseData = validationResponse.result.ResponseData;
      res.setStatusCode(ResponseData.ResponseCode);
      return this.returnRes(ResponseData);
    };

    const response = new Pipeline('int__endpt_sub_stat_update')
      .process(body());

    res.setStatusCode(response.statusCode || response.ResponseCode);
    return response.body || this.returnRes(response);
  }

  /* ******************************** Old routes ***********************/
  /* ****************  screen failure status update ***************************/
  @log({ traceResult: true, traceError: true })
  @route('POST /status_update', {
    acl: ['account.anonymous'],
    apiKey: 'int__platform',
    priority: 999,
  })
  @as('c_system_user', {
    safe: false,
    principal: { skipAcl: true, grant: 'read' },
  })
  static validateStatusUpdateRequest({ req, body, res, next }) {

    const validationResponse = this.validateAuthToken(req, body());

    if (validationResponse.error === true) {
      const ResponseData = validationResponse.result.ResponseData;
      res.setStatusCode(ResponseData.ResponseCode);
      return {
        object: 'result',
        data: {
          ResponseData,
        },
      };
    };

    next();
  }

  @log({ traceResult: true, traceError: true })
  @route('POST status_update', {
    acl: 'account.anonymous',
    apiKey: 'int__platform',
  })
  @as('c_system_user', {
    safe: false,
    principal: { skipAcl: true, grant: 'update' },
  })
  static status_update({
    req,
    body,
    res,
    runtime: {
      configuration: { path },
      metadata: { className: conName },
    },
  }) {

    const validateFeature = this.validateFeature('int__endpt_sub_stat_update', body());

    if (validateFeature.error) {
      const ResponseData = validateFeature.result.ResponseData;
      res.setStatusCode(ResponseData.ResponseCode);
      return this.returnRes(ResponseData);
    }

    const validationResponse = this.validateRequestStatusUpdateEndpoint(body());

    if (validationResponse.error === true) {
      const ResponseData = validationResponse.result.ResponseData;
      res.setStatusCode(ResponseData.ResponseCode);
      return this.returnRes(ResponseData);

    };

    const response = new Pipeline('int__endpt_sub_stat_update')
      .process(body());

    res.setStatusCode(response.statusCode || response.ResponseCode);
    return response.body || this.returnRes(response);
  }

  /* **************************** This route will get called when rescreening happen at Endpoint ********************/
  @log({ traceResult: true, traceError: true })
  @route('POST /rescreen', {
    acl: ['account.anonymous'],
    apiKey: 'int__platform',
    priority: 999,
  })
  @as('c_system_user', {
    safe: false,
    principal: { skipAcl: true, grant: 'read' },
  })
  static validateRescreenRequest({ req, body, res, next }) {

    const validationResponse = this.validateAuthToken(req, body());

    if (validationResponse.error === true) {
      const ResponseData = validationResponse.result.ResponseData;
      res.setStatusCode(ResponseData.ResponseCode);
      return {
        object: 'result',
        data: {
          ResponseData,
        },
      };
    };

    next();
  }

  @route({
    weight: 1,
    method: 'POST',
    name: 'c_rescreen',
    path: 'rescreen',
    acl: ['account.anonymous'],
    apiKey: 'int__platform',
  })
  @as('c_system_user', {
    safe: false,
    principal: { skipAcl: true, grant: 'update' },
  })
  static reScreen({
    req,
    body,
    res,
    runtime: {
      configuration: { path },
      metadata: { className: con_name },
    },
  }) {

    const validateFeature = this.validateFeature('int__endpt_sub_rescreen', body());

    if (validateFeature.error) {
      const ResponseData = validateFeature.result.ResponseData;
      res.setStatusCode(ResponseData.ResponseCode);
      return this.returnRes(ResponseData);
    }

    const validationResponse = this.validateRequestStatusUpdateEndpoint(body());

    if (validationResponse.error === true) {
      const ResponseData = validationResponse.result.ResponseData;
      res.setStatusCode(ResponseData.ResponseCode);
      return this.returnRes(ResponseData);
    };

    const response = new Pipeline('int__endpt_sub_rescreen')
      .process(body());

    res.setStatusCode(response.statusCode || response.ResponseCode);
    return response.body || this.returnRes(response);
  }

  @log({ traceResult: true, traceError: true })
  @route('POST /int/v1/endpoint-irt/administration', {
    acl: ['account.anonymous'],
    apiKey: 'int__platform',
    priority: 999,
  })
  @as('c_system_user', {
    safe: false,
    principal: { skipAcl: true, grant: 'read' },
  })
  static validateAdminRequest({ req, body, res, next }) {

    const validationResponse = this.validateAuthToken(req, body());

    if (validationResponse.error === true) {
      const ResponseData = validationResponse.result.ResponseData;
      res.setStatusCode(ResponseData.ResponseCode);
      return {
        object: 'result',
        data: {
          ResponseData,
        },
      };
    };

    next();
  }

  @route('POST /int/v1/endpoint-irt/administration', {
    acl: 'account.anonymous',
    apiKey: 'int__platform',
  })
  @as('c_system_user', {
    safe: false,
    principal: { skipAcl: true, grant: 'read' },
  })
  static administrationInbound({ body, res }) {

    const validateFeature = this.validateFeature('int__endpt_admin', body());

    if (validateFeature.error) {
      const ResponseData = validateFeature.result.ResponseData;
      res.setStatusCode(ResponseData.ResponseCode);
      return this.returnRes(ResponseData);
    }

    const response = new Pipeline('int__endpt_admin')
      .process();

    res.setStatusCode(response.statusCode || response.ResponseCode);
    return response.body || this.returnRes(response);
  }

  /*
   *  _____    _
   * |_   _| _(_)__ _ __ _ ___ _ _ ___
   *   | || '_| / _` / _` / -_) '_(_-<
   *   |_||_| |_\__, \__, \___|_| /__/
   *            |___/|___/
   */

  @log({ traceError: true })
  @trigger('update.after', {
    object: 'ec__signed_document',
    weight: 1,
    principal: 'c_system_user',
    if: {
      $check__ec_document_status: '$$ROOT',
    },
    rootDocument: 'runtime',
  })
  static subsequentEconsentSigned(data) {
    const { context, old } = data;
    if (Utils.isVendorEnabled(EndptVendor.VENDOR)) {
      const user = org.objects.c_public_user.readOne({ _id: old.ec__primary_participant._id })
        .throwNotFound(false)
        .skipAcl()
        .grant('read')
        .execute();

      if (!user.c_number || user.c_status === 'Screen-Fail') {
        new Pipeline('int__endpt_sub_reg_ec')
          .queue({ _id: context._id, int__sequence: old.ec__primary_participant._id }, { retryCount: 5 });
      }

    }
  }

  @log({ traceError: true })
  @trigger('update.after', {
    object: 'c_task_response',
    weight: 1,
    principal: 'c_system_user',
    if: {
      $and: [
        { $gte: [{ $indexOfArray: ['$$SCRIPT.arguments.modified', 'c_completed'] }, 0] },
        { $eq: ['$$ROOT.c_completed', true] },
      ],
    },
  })
  static taskCompletion(data) {
    const { context, old } = data;
    if (Utils.isVendorEnabled(EndptVendor.VENDOR)) {
      const pipelines = Utils.fetchPipelinesFromTaskResponse(
        context._id,
        EndptVendor.VENDOR,
      );

      const user = org.objects.c_public_user.readOne({ _id: old.c_public_user._id })
        .throwNotFound(false)
        .skipAcl()
        .grant('read')
        .execute();

      for (const pipeline of pipelines) {
        let executePipeline = user.c_status === 'Consented';

        switch (pipeline.int__identifier) {
          case 'int__endpt_sub_reconsent_task': {
            executePipeline = user.c_status === 'Screen-Fail';
            break;
          }
          case 'int__endpt_sub_reg_task': {
            executePipeline = !user.c_number || user.c_status === 'Screen-Fail';
            break;
          }
        }

        if (executePipeline) {
          new Pipeline(pipeline.int__identifier)
            .queue({ _id: context._id, int__sequence: old.c_public_user._id }, { retryCount: 5 });
        }

      }
    }
  }

  static validateRequestStatusUpdateEndpoint(reqBody) {

    const eventKey = Object.keys(reqBody)[0];
    const { TransactionID } = reqBody[eventKey].GeneralData;
    const eventBody = Object.keys(reqBody[eventKey]);

    const { SiteNumber, PatientNumber, NewSubjectStatus, MedableSubjectID: subjectId } = reqBody[eventKey][eventBody[eventBody.length - 1]];

    if (!subjectId || subjectId.toString()
      .trim().length === 0) {
      return IntFaults.throwError('integrations.invalidArgument.invalidSubjectId', TransactionID);
    }
    if (!isIdFormat(subjectId)) {
      return IntFaults.throwError('integrations.invalidArgument.invalidIdFormat', TransactionID);
    }

    if (!SiteNumber || SiteNumber.toString()
      .trim().length === 0) {
      return IntFaults.throwError('integrations.invalidArgument.invalidSite', TransactionID);
    }
    if (!PatientNumber || PatientNumber.toString()
      .trim().length === 0) {
      return IntFaults.throwError('integrations.invalidArgument.invalidPatientNumber', TransactionID);
    }

    const site = org.objects.c_site.readOne({ c_number: SiteNumber })
      .throwNotFound(false)
      .skipAcl()
      .grant('read')
      .execute();

    if (!site) {
      return IntFaults.throwError('integrations.invalidArgument.siteNotPresent', TransactionID);
    };

    const subject = org.objects.c_public_user.readOne({ _id: subjectId, c_site: site._id })
      .throwNotFound(false)
      .skipAcl()
      .grant('read')
      .execute();

    if (!subject) {
      return IntFaults.throwError('integrations.invalidArgument.subjectNotPresent', TransactionID);
    };

    return {
      error: false,
      result: { subjectId, PatientNumber, TransactionID, NewSubjectStatus },
    };

  }

  static validateAuthToken(req, reqBody = null) {
    let TransactionID;
    const eventKey = reqBody && Object.keys(reqBody)[0];
    if (eventKey) {
      TransactionID = reqBody[eventKey].GeneralData.TransactionID;
    }

    const valid = Utils.isValidAuthenticationHeader(
      req,
      org.objects.int__secrets.find({
        int__identifier: 'int__endpt_auth_username',
      })
        .expand(['int__value'])
        .next()
        .int__value,

      org.objects.int__secrets.find({
        int__identifier: 'int__endpt_auth_password',
      })
        .expand(['int__value'])
        .next()
        .int__value,
    );

    if (!valid) {
      return IntFaults.throwError('integrations.accessDenied.invalidCredentials', TransactionID);
    };

    return { error: false };

  }

  static validateFeature(pipeline, reqBody = null) {
    let TransactionID;
    const eventKey = reqBody && Object.keys(reqBody)[0];
    if (eventKey) {
      TransactionID = reqBody[eventKey].GeneralData.TransactionID;
    }

    if (!Utils.isVendorEnabled(EndptVendor.VENDOR) || !Utils.isPipelineEnabled(pipeline)) {
      return IntFaults.throwError('integrations.invalidArgument.featureDisabled', TransactionID);
    }

    return { error: false };
  }

  static returnRes(ResponseData) {
    return {
      object: 'result',
      data: {
        ResponseData,
      },
    };
  }

}

module.exports = EndptVendor;