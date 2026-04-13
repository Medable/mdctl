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
 * @classdesc YPrime Vendor routes and triggers
 * @class
 */
export class YPrimeVendor {

  static VENDOR = 'int__yprime';

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
   *     YPrimeBasicAuth:
   *       type: http
   *       scheme: basic
   */
  @log({ traceResult: true, traceError: true })
  @route('* /int/v1/yprime/*', {
    acl: ['account.anonymous'],
    apiKey: 'int__platform',
    priority: 999,
  })
  @as('c_system_user', {
    safe: false,
    principal: { skipAcl: true, grant: 'read' },
  })
  static validateRequest({ req, body, res, next }) {
    if (req.path !== '/routes/int/v1/yprime/config') {
      const validationResponse = this.validateAuthToken(req, body());

      if (validationResponse.error === true) {
        const ResponseData = validationResponse.result.ResponseData;
        res.setStatusCode(ResponseData.ResponseCode);
        return ResponseData;
      };
    }

    next();
  }

  /**
   * @ignore
   * @swagger
   * /routes/int/v1/yprime/config:
   *   put:
   *     summary: YPrime Config Route
   *     description: Updates the YPrime integration config
   *     tags:
   *       - YPrime
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
   *                       type: string
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
   *             YPrime Config:
   *               value:
   *                 enabled: true
   *                 pipelines:
   *                   - int__enabled: true
   *                     int__identifier: int__yprime_admin
   *                   - int__enabled: true
   *                     int__identifier: int__yprime_ping
   *                   - int__enabled: true
   *                     int__identifier: int__yprime_sub_reg_ec
   *                   - int__enabled: true
   *                     int__identifier: int__yprime_sub_reg_task
   *                   - int__enabled: true
   *                     int__identifier: int__yprime_sub_stat_update
   *                 secrets:
   *                   - int__identifier: int__yprime_api_key
   *                     int__value: ""
   *                   - int__identifier: int__yprime_auth_password
   *                     int__value: ""
   *                   - int__identifier: int__yprime_auth_username
   *                     int__value: ""
   *                   - int__identifier: int__yprime_base_url
   *                     int__value: ""
   *                   - int__identifier: int__yprime_sponsor
   *                     int__value: ""
   *                   - int__identifier: int__yprime_study_protocol
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
  @route('PUT /int/v1/yprime/config', {
    acl: 'role.administrator',
    apiKey: 'int__platform',
  })
  @as('c_system_user', {
    safe: false,
    principal: { skipAcl: true, grant: 'update' },
  })
  static config({ body }) {
    const {
      enabled,
      pipelines = [],
      secrets = [],
    } = body();

    return Utils.configRoute({
      vendor: YPrimeVendor.VENDOR,
      enabled,
      pipelines,
      secrets,
    });
  }

  /**
   * @ignore
   * @swagger
   * /routes/int/v1/yprime/ping:
   *   get:
   *     summary: YPrime Ping Route
   *     description: Gets the environment, protocol and site data from YPrime
   *     tags:
   *       - YPrime
   *     security:
   *       - YPrimeBasicAuth: []
   *     responses:
   *       200:
   *         description: OK
   *       401:
   *         description: Unauthorized
   *       400:
   *         description: Bad Request
   */
  @log({ traceResult: true, traceError: true })
  @route('GET /int/v1/yprime/ping', {
    acl: 'account.anonymous',
    apiKey: 'int__platform',
  })
  @as('c_system_user', {
    safe: false,
    principal: { skipAcl: true, grant: 'read' },
  })
  static ping({ res } = {}) {
    const response = new Pipeline('int__yprime_ping')
      .process();

    res && res.setStatusCode(response.statusCode);
    return response.body;
  }

  /**
   * @ignore
   * @swagger
   * /routes/int/v1/yprime/administration:
   *   post:
   *     summary: YPrime Administration Route
   *     description: Gets the environment, protocol and sites data
   *     tags:
   *       - YPrime
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     security:
   *       - YPrimeBasicAuth: []
   *     responses:
   *       200:
   *         description: OK
   *       401:
   *         description: Unauthorized
   *       400:
   *         description: Bad Request
   */
  @log({ traceResult: true, traceError: true })
  @route('POST /int/v1/yprime/administration', {
    acl: 'account.anonymous',
    apiKey: 'int__platform',
  })
  @as('c_system_user', {
    safe: false,
    principal: { skipAcl: true, grant: 'read' },
  })
  static administration({ res }) {
    const response = new Pipeline('int__yprime_admin')
      .process();

    res.setStatusCode(response.statusCode);
    return response.body;
  }

  /**
   * @ignore
   * @swagger
   * /routes/int/v1/yprime/status-update:
   *   post:
   *     summary: YPrime Status Update Route
   *     description: Update the status of a subject
   *     tags:
   *       - YPrime
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     security:
   *       - YPrimeBasicAuth: []
   *     responses:
   *       200:
   *         description: OK
   *       401:
   *         description: Unauthorized
   *       400:
   *         description: Bad Request
   */
  @log({ traceResult: true, traceError: true })
  @route('POST /int/v1/yprime/status-update', {
    acl: 'account.anonymous',
    apiKey: 'int__platform',
  })
  @as('c_system_user', {
    safe: false,
    principal: { skipAcl: true, grant: 'update' },
  })
  static statusUpdate({ body, res }) {

    const validationResponse = this.validateRequestStatusUpdateYprime(body());

    if (validationResponse.error === true) {
      const ResponseData = validationResponse.result.ResponseData;
      res.setStatusCode(ResponseData.ResponseCode);
      return ResponseData;
    };

    const response = new Pipeline('int__yprime_sub_stat_update')
      .process(body());

    res.setStatusCode(response.statusCode);
    return response.body;
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

    if (Utils.isVendorEnabled(YPrimeVendor.VENDOR)) {
      new Pipeline('int__yprime_sub_reg_ec')
        .queue({ _id: context._id, int__sequence: old.ec__primary_participant._id }, { retryCount: 5 });
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

    if (Utils.isVendorEnabled(YPrimeVendor.VENDOR)) {
      const pipelines = Utils.fetchPipelinesFromTaskResponse(
        context._id,
        YPrimeVendor.VENDOR,
      );

      for (const pipeline of pipelines) {
        new Pipeline(pipeline.int__identifier)
          .queue({ _id: context._id, int__sequence: old.c_public_user._id }, { retryCount: 5 });
      }
    }
  }

  static validateRequestStatusUpdateYprime(reqBody) {
    const { TransactionID } = reqBody.SubjectStatusUpdateEvent.GeneralData;
    const { SiteNumber, PatientNumber, NewSubjectStatus, MedableSubjectID: subjectId } = reqBody.SubjectStatusUpdateEvent.SubjectStatusUpdateData;
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
    const subject = org.objects.c_public_user.readOne({ _id: subjectId })
      .throwNotFound(false)
      .skipAcl()
      .grant('read')
      .execute();
    if (!subject) {
      return this.returnErr('integrations.invalidArgument.subjectNotPresent', TransactionID);
    }

    return {
      error: false,
      result: { subjectId, PatientNumber, TransactionID, NewSubjectStatus },
    };

  }

  static validateAuthToken(req, reqBody) {
    let TransactionID;
    const eventKey = Object.keys(reqBody)[0];
    if (eventKey) {
      TransactionID = reqBody[eventKey].GeneralData.TransactionID;
    }

    const valid = Utils.isValidAuthenticationHeader(
      req,
      org.objects.int__secrets.find({
        int__identifier: 'int__yprime_auth_username',
      })
        .expand(['int__value'])
        .next()
        .int__value,

      org.objects.int__secrets.find({
        int__identifier: 'int__yprime_auth_password',
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

}