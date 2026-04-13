/**
 * DO NOT CUSTOMIZE THIS FILE!
 * Upgrading the integrations-platform package version will overwrite any changes.
 */

import base64 from 'base64';
import {
  as,
  log,
  route,
  trigger,
} from 'decorators';
import Pipeline from 'int__pipeline';
import Utils from 'int__utils';

/**
 * @classdesc Core Vendor routes and triggers
 * @class
 */
class CoreVendor {

  static VENDOR = 'int__core';
  /*
   *  ___          _
   * | _ \___ _  _| |_ ___ ___
   * |   / _ \ || |  _/ -_|_-<
   * |_|_\___/\_,_|\__\___/__/
   */

  /**
   * @ignore
   * @swagger
   * /routes/int/v1/core/config:
   *   put:
   *     summary: Core Config Route
   *     description: Updates the Core integration config
   *     tags:
   *       - Core
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
   *             Core Config:
   *               value:
   *                 enabled: true
   *                 pipelines:
   *                   - int__enabled: true
   *                     int__identifier: int__core_ping
   *                   - int__enabled: true
   *                     int__identifier: int__core_sub_stat_update_user_out
   *                     int__statuses:
   *                       - consented
   *                       - screen-passed
   *                   - int__enabled: true
   *                     int__identifier: int__core_sub_reg_ec
   *                   - int__enabled: true
   *                     int__identifier: int__core_extended_sub_reg_ec
   *                     int__include_pii:
   *                      first_name: false
   *                      last_name: false
   *                      email: false
   *                      phone_number: false
   *                   - int__enabled: true
   *                     c_task:
   *                       type: array
   *                     c_steps:
   *                       type: object
   *                     int__identifier: int__core_extended_sub_withdrawal
   *                 secrets:
   *                   - int__identifier: int__core_host_url
   *                     int__value: ""
   *                   - int__identifier: int__core_password
   *                     int__value: ""
   *                   - int__identifier: int__core_study_protocol
   *                     int__value: ""
   *                   - int__identifier: int__core_username
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
  @route('PUT /int/v1/core/config', {
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
      vendor: CoreVendor.VENDOR,
      enabled,
      pipelines,
      secrets,
    });
  }

  /**
   * @ignore
   * @swagger
   * /routes/int/v1/core/ping:
   *   get:
   *     summary: Core Ping Route
   *     description: Gets the environment, protocol and site data from Core
   *     tags:
   *       - Core
   *     security:
   *       - CoreBasicAuth: []
   *     responses:
   *       200:
   *         description: OK
   *       401:
   *         description: Unauthorized
   *       400:
   *         description: Bad Request
   */
  @log({ traceResult: true, traceError: true })
  @route('GET /int/v1/core/ping', {
    acl: 'role.administrator',
    apiKey: 'int__platform',
  })
  @as('c_system_user', {
    safe: false,
    principal: { skipAcl: true, grant: 'read' },
  })
  static ping({ res } = {}) {
    const validateFeature = Utils.validateFeature(CoreVendor.VENDOR, 'int__core_ping');

    if (validateFeature.error) {
      const ResponseData = validateFeature.result.ResponseData;
      res && res.setStatusCode(ResponseData.ResponseCode);
      return ResponseData;
    }

    const authHeader = this.generateAccessToken();

    const response = new Pipeline('int__core_ping')
      .process({
        authHeader,
      });

    res && res.setStatusCode(response.statusCode || response.ResponseCode);

    return response;
  }

  /**
   * @ignore
   * @swagger
   * /routes/int/v1/core/extended/ping:
   *   get:
   *     summary: Core Extended Ping Route
   *     description: Route to test connectivity with vendor
   *     tags:
   *       - Core
   *     security:
   *       - CoreOAuth: []
   *     responses:
   *       200:
   *         description: OK
   *       401:
   *         description: Unauthorized
   *       400:
   *         description: Bad Request
   */
   @log({ traceResult: true, traceError: true })
   @route('GET /int/v1/core/extended/ping', {
     acl: 'role.administrator',
     apiKey: 'int__platform',
   })
   @as('c_system_user', {
     safe: false,
     principal: { skipAcl: true, grant: 'read' },
   })
  static extendedPing({ res } = {}) {
    const validateFeature = Utils.validateFeature(CoreVendor.VENDOR, 'int__core_extended_ping');

    if (validateFeature.error) {
      const ResponseData = validateFeature.result.ResponseData;
      res && res.setStatusCode(ResponseData.ResponseCode);
      return ResponseData;
    }

    const response = new Pipeline('int__core_extended_ping')
      .process();
    res && res.setStatusCode(response.statusCode || response.ResponseCode);
    return response;
  }

   /*
   *  _____    _
   * |_   _| _(_)__ _ __ _ ___ _ _ ___
   *   | || '_| / _` / _` / -_) '_(_-<
   *   |_||_| |_\__, \__, \___|_| /__/
   *            |___/|___/
   */

  @log({ traceResult: true, traceError: true })
  @trigger('update.after', {
    object: 'c_public_user',
    weight: 1,
    principal: 'c_system_user',
    if: { $gte: [{ $indexOfArray: ['$$SCRIPT.arguments.modified', 'c_status'] }, 0] },
  })
   static subjectStatusUpdate(data) {
     const { context } = data;

     const validStatuses = org.objects.int__pipeline.find({
       int__identifier: 'int__core_sub_stat_update_user_out',
     })
       .next()
       .int__statuses;

     const authHeader = this.generateAccessToken();

     if (
       Utils.isVendorEnabled(CoreVendor.VENDOR) &&
      Utils.isPipelineEnabled('int__core_sub_stat_update_user_out') &&
      validStatuses.includes(context.c_status)
     ) {
       new Pipeline('int__core_sub_stat_update_user_out')
         .queue({
           _id: context._id,
           int__sequence: context._id,
           authHeader,
         }, {
           retryCount: 5,
         });
     }
   }

  @log({ traceResult: true, traceError: true })
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
    if (Utils.isVendorEnabled(CoreVendor.VENDOR)) {
      const { context, old } = data;

      // the code below triggers the old sub reg pipeline without the extended fields and changes user status to consented prior to triggering the pipeline
      if (Utils.isPipelineEnabled('int__core_sub_reg_ec')) {
        this.triggerSubjectConsent(context, old);
      }

      // the code below triggers the exteded sub reg pipeline based on the custom field set
      if (Utils.isPipelineEnabled('int__core_extended_sub_reg_ec')) {
        this.triggerExtendedSubjectConsent(context, old);
      }

    }
  }

   @log({ traceResult: true, traceError: true })
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
    if (Utils.isVendorEnabled(CoreVendor.VENDOR)) {
      const pipelines = Utils.fetchPipelinesFromTaskResponse(
        context._id,
        CoreVendor.VENDOR,
      );

      for (const pipeline of pipelines) {
        const steps = Utils.fetchStepsFromTaskResponse(
          context._id,
          pipeline.int__identifier,
        );
        new Pipeline(pipeline.int__identifier)
          .queue({ _id: context._id, int__sequence: old.c_public_user._id, c_steps: steps }, { retryCount: 5 });

      }
    }
  }

   static generateAccessToken() {
     const username = org.objects.int__secret.find({
       int__identifier: 'int__core_username',
     })
       .expand('int__value')
       .next()
       .int__value;

     const password = org.objects.int__secret.find({
       int__identifier: 'int__core_password',
     })
       .expand('int__value')
       .next()
       .int__value;

     return base64.encode(`${username}:${password}`);

   }

   static triggerSubjectConsent(context, data) {
     const user = org.objects.c_public_user.updateOne(
       { _id: data.ec__primary_participant._id },
       {
         $set: {
           c_status: 'Consented',
         },
       },
     )
       .skipAcl()
       .grant('update')
       .execute();

     const authHeader = this.generateAccessToken();

     if (user) {
       new Pipeline('int__core_sub_reg_ec')
         .queue({ _id: context._id, int__sequence: user, authHeader }, { retryCount: 5 });

     }
   }

   static triggerExtendedSubjectConsent(context, data) {
     const documentTemplate = org.objects.ec__document_template.readOne({ _id: data.ec__document_template._id })
       .execute();

     const isIntegratedDocument = documentTemplate.ec__custom_data.some((d) => {
       return d.ec__label.trim()
         .toLowerCase() === 'integrated consent document' &&
        d.ec__value.trim()
          .toLowerCase() === 'yes';
     });

     const user = org.objects.c_public_user.readOne({ _id: data.ec__primary_participant._id })
       .paths('c_number')
       .execute();

     if (isIntegratedDocument) {
       new Pipeline('int__core_extended_sub_reg_ec')
         .queue({
           _id: context._id,
           int__sequence: data.ec__primary_participant._id,
           is_new_subject: !user.c_number,
         },
         { retryCount: 5 },
         );
     }
   }

}

module.exports = CoreVendor;