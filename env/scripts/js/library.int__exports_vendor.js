/**
 * DO NOT CUSTOMIZE THIS FILE!
 * Upgrading the integrations-platform package version will overwrite any changes.
 */
import {
  log,
  route,
  as,
} from 'decorators';
import logger from 'logger';
import Pipeline from 'int__pipeline';
import Utils from 'int__utils';
import { Job } from 'renderer';
const IntFaults = require('int__faults');
const config = require('config');
const AirflowConfig = config.get('int__airflow_service_config');
const AirflowDomainUrl = AirflowConfig.serviceUrls[script.env.host];

/**
 * @classdesc Exports Vendor routes and triggers
 * @class
 */
class ExportsVendor {

  static VENDOR = 'int__exports';

  /*
      ___          _
    | _ \___ _  _| |_ ___ ___
    |   / _ \ || |  _/ -_|_-<
    |_|_\___/\_,_|\__\___/__/

    */

  /**
   * @ignore
   * @swagger
   * components:
   *   securitySchemes:
   *     DataExportsBasicAuth:
   *       type: http
   *       scheme: basic
  */
  @log({ traceResult: true, traceError: true })
  @route('* /int/v:version/exports/*', {
    acl: ['account.anonymous'],
    apiKey: 'int__platform',
    priority: 999,
  })
  @as('c_system_user', {
    safe: false,
    principal: { skipAcl: true, grant: 'read' },
  })
  static validateRequest({ req, res, next }) {
    if (req.path !== '/routes/int/v1/exports/config') {
      const validationResponse = this.validateAuthToken(req);

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
   * /routes/int/v1/exports/config:
   *   put:
   *     summary: Data Export Config Route
   *     description: Updates the Data Export integration config
   *     tags:
   *       - Exports
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
   *             Data Export Config:
   *               value:
   *                 enabled: true
   *                 pipelines:
   *                   - int__enabled: true
   *                     int__identifier: int__exports_study_data
   *                   - int__enabled: true
   *                     int__identifier: int__exports_study_data_v2
   *                   - int__enabled: true
   *                     int__identifier: int__exports_fetch_status
   *                   - int__enabled: true
   *                     int__identifier: int__exports_fetch_status_v2
   *                   - int__enabled: true
   *                     int__identifier: int__exports_fetch_logs
   *                   - int__enabled: true
   *                     int__identifier: int__exports_delete_s3_file
   *                   - int__enabled: true
   *                     int__identifier: int__exports_admin
   *                 secrets:
   *                   - int__identifier: int__exports_username
   *                     int__value: ""
   *                   - int__identifier: int__exports_password
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
  @route('PUT /int/v1/exports/config', {
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
      vendor: ExportsVendor.VENDOR,
      enabled,
      pipelines,
      secrets,
    });
  }

  /**
   * @ignore
   * @swagger
   * /routes/int/v{version}/exports/jobs:
   *   post:
   *     summary: Create Data Export Route
   *     description: Creates Export Job
   *     tags:
   *       - Exports
   *     security:
   *       - DataExportsBasicAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *           examples:
   *             Exports Job :
   *               value:
   *                 name: "exports_study_data"
   *
   *     responses:
   *       200:
   *         description: OK
   *       401:
   *         description: Unauthorized
   *       400:
   *         description: Bad Request
   */
  @log({ traceResult: true, traceError: true })
  @route('POST /int/v:version/exports/jobs', {
    acl: 'account.anonymous',
  })
  @as('export__service', {
    safe: false,
    principal: { skipAcl: true, grant: 'update' },
  })
  static extractStudyDataAsync({ req, body, res }) {

    const version = +req.params.version;

    const reqBody = body();

    let pipeline = '';
    switch (version) {
      case 1: {
        pipeline = `int__${reqBody.name}`;
        break;
      }
      case 2: {
        pipeline = `int__${reqBody.name}_v2`;
        break;
      }
    }

    const validateFeature = this.validateFeature(pipeline);

    if (validateFeature.error) {
      const ResponseData = validateFeature.result.ResponseData;
      res.setStatusCode(ResponseData.ResponseCode);
      return ResponseData;
    }

    const response = new Pipeline(pipeline)
      .process({ authToken: Utils.createToken(), domainUrl: AirflowDomainUrl });

    res.setStatusCode(response.statusCode || response.ResponseCode);
    return response;
  }

  /**
   * @ignore
   * @swagger
   * /routes/int/v1/exports/jobs/{jobId}:
   *   get:
   *     summary: Check Export Job Status
   *     description: Check Export Job Status
   *     tags:
   *       - Exports
   *     security:
   *       - DataExportsBasicAuth: []
   *     parameters:
   *      - in: path
   *        name: jobId
   *        required: true
   *        schema:
   *          type: string
   *     requestBody:
   *       required: false
   *       content: {}
   *     responses:
   *       200:
   *         description: OK
   *       401:
   *         description: Unauthorized
   *       400:
   *         description: Bad Request
   */
  @log({ traceResult: true, traceError: true })
  @route('GET /int/v1/exports/jobs/:jobId', {
    acl: 'account.anonymous',
  })
  @as('administrator', {
    safe: false,
    principal: { skipAcl: true, grant: 'read' },
  })
  static jobStatus({ req, body, res }) {

    const validateFeature = this.validateFeature('int__exports_fetch_status');

    if (validateFeature.error) {
      const ResponseData = validateFeature.result.ResponseData;
      res.setStatusCode(ResponseData.ResponseCode);
      return ResponseData;
    }

    const response = new Pipeline('int__exports_fetch_status')
      .process(req.params);

    res.setStatusCode(response.statusCode || response.ResponseCode);
    return response;
  }

  /**
   * @ignore
   * @swagger
   * /routes/int/v2/exports/jobs/{jobId}:
   *   get:
   *     summary: Get Airflow Job Status and logs (if error)
   *     description: Get Airflow Job Status and logs (if error)
   *     tags:
   *       - Exports
   *     security:
   *       - DataExportsBasicAuth: []
   *     parameters:
   *      - in: path
   *        name: jobId
   *        required: true
   *        schema:
   *          type: string
   *     requestBody:
   *       required: false
   *       content: {}
   *     responses:
   *       200:
   *         description: OK
   *       401:
   *         description: Forbidden
   *       400:
   *         description: Bad Request
   */
   @log({ traceResult: true, traceError: true })
   @route('GET /int/v2/exports/jobs/:jobId', {
     acl: 'account.anonymous',
   })
   @as('administrator', {
     safe: false,
     principal: { skipAcl: true, grant: 'read' },
   })
  static getAirflowJobStatus({ req, res }) {
    const validateFeature = this.validateFeature('int__exports_fetch_status_v2');
    const validateLogs = this.validateFeature('int__exports_fetch_logs');

    if (validateFeature.error || validateLogs.error) {
      const ResponseData = (validateFeature.result && validateFeature.result.ResponseData) ||
      (validateLogs.result && validateLogs.result.ResponseData);
      res.setStatusCode(ResponseData.ResponseCode);
      return ResponseData;
    }

    let response = {};
    const { body: job } = this.processAirflowPipeline('int__exports_fetch_status_v2', { jobId: req.params.jobId, domainUrl: AirflowDomainUrl });
    // if dag not found then its an invalid job ID
    if (job.status === 404) {
      response = {
        statusCode: 400,
        message: 'Invalid Job ID',
      };
      res.setStatusCode(response.statusCode);
      return response;
    }

    switch (job.state) {
      case 'success': {
        const url = (JSON.parse(job.note)).s3_link;
        response = {
          statusCode: 200,
          status: 'COMPLETED',
          url: url,
        };
        break;
      }

      case 'failed': {
        const logs = this.processAirflowPipeline('int__exports_fetch_logs', { dagRunId: job.dag_run_id, domainUrl: AirflowDomainUrl });
        response = {
          statusCode: 400,
          status: 'ERROR',
          logs,
        };
        break;
      }

      case 'running': {
        response = {
          statusCode: 200,
          status: 'RUNNING',
        };
        break;
      }

    }
    res.setStatusCode(response.statusCode);
    return response;
  }

  /**
   * @ignore
   * @swagger
   * /routes/int/v1/exports/callback:
   *   post:
   *     summary:  Export callback for tracking status and errors
   *     description: Export callback for tracking status and errors
   *     tags:
   *       - Exports
   *     security:
   *       - DataExportsBasicAuth: []
   *     requestHeader:
   *       name: token
   *       required: true
   *       schema:
   *          type: string
   *     requestBody:
   *       required: true
   *       content:
   *          application/json:
   *            schema:
   *              type: object
   *              properties:
   *                _id:
   *                  type: string
   *                uuid:
   *                  type: string
   *                callbackError:
   *                  type: string
   *                cancelled:
   *                  type: boolean
   *                context:
   *                  type: string
   *                details:
   *                  type: array
   *                status:
   *                  type: string
   *     responses:
   *        200:
   *          description: OK
   *        401:
   *          description: Unauthorized
   *        400:
   *          description: Bad Request
   */
  @log({ traceResult: true, traceError: true })
  @route('POST /int/v1/exports/callback', {
    acl: 'account.anonymous',
    priority: 1000,
  })
  @as('export__service', {
    safe: false,
    principal: { skipAcl: true, grant: 'update' },
  })
   static callBack({ body }) {
     const AXON_APP = 'c_axon_demo_app';
     let jobStatus;
     const data = body(),
       { executionId } = data,
       [execution] = org.objects.int__dt_execution.find({ _id: executionId });
     let updateFields = {};

     try {
       const rendererJobStatus = new Job(AXON_APP)
         .status(execution.int__dt_renderer_key);

       // the status object contains a single key whose value contains relevant info
       const keys = Object.keys(rendererJobStatus);
       jobStatus = rendererJobStatus[keys[0]];
     } catch (error) {
       // the renderer will throw an exception if the key isn't found, but the error has
       // getters so needs toJSON since this runs in the sandbox
       // see - https://medable.slack.com/archives/CCYN7CEAZ/p1615908298013900
       // logger.error('Error retreiving renderer job status', err.toJSON());
       jobStatus = error.toJSON();
     }
     const { status, err, errCode } = jobStatus;
     if (status === 'Completed' && execution.int__status !== 'SUCCESS') {
       updateFields = { int__status: 'SUCCESS' };
     } else if ((status === 'Error' || errCode === 'renderer.notFound.error') && execution.int__status !== 'ERROR') {
       const error = err || 'Unknown error';
       updateFields = { int__status: 'ERROR', int__error: error };
     } else {
       logger.debug(`Execution: ${execution._id} is still running and has not encountered an error.`);
     }

     org.objects.int__dt_execution.updateOne({ _id: executionId }, { $set: updateFields })
       .skipAcl()
       .grant(8)
       .execute();

   }

  /**
   * @ignore
   * @swagger
   * /routes/int/v1/exports/jobs/{jobId}:
   *   delete:
   *     summary: Removes S3 file for the specified job ID
   *     description: Removes S3 file
   *     tags:
   *       - Exports
   *     security:
   *       - DataExportsBasicAuth: []
   *     parameters:
   *      - in: path
   *        name: jobId
   *        required: true
   *        schema:
   *          type: string
   *     requestBody:
   *       required: false
   *       content: {}
   *     responses:
   *       200:
   *         description: OK
   *       401:
   *         description: Unauthorized
   *       400:
   *         description: Bad Request
   */
  @log({ traceResult: true, traceError: true })
  @route('DELETE /int/v1/exports/jobs/:jobId', {
    acl: 'account.anonymous',
  })
  @as('administrator', {
    safe: false,
    principal: { skipAcl: true, grant: 'read' },
  })
  static removeFile({ req, body, res }) {

    const validateFeature = this.validateFeature('int__exports_delete_s3_file');

    if (validateFeature.error) {
      const ResponseData = validateFeature.result.ResponseData;
      res.setStatusCode(ResponseData.ResponseCode);
      return ResponseData;
    }

    const response = new Pipeline('int__exports_delete_s3_file')
      .process(req.params);

    res.setStatusCode(response.statusCode || response.ResponseCode);
    return response;
  }

  static validateAuthToken(req) {
    const valid = Utils.isValidAuthenticationHeader(
      req,
      org.objects.int__secrets.find({
        int__identifier: 'int__exports_username',
      })
        .expand(['int__value'])
        .next()
        .int__value,

      org.objects.int__secrets.find({
        int__identifier: 'int__exports_password',
      })
        .expand(['int__value'])
        .next()
        .int__value,
    );

    if (!valid) {
      return IntFaults.throwError('integrations.accessDenied.invalidCredentials');
    };

    return { error: false };

  }

  /**
   * @ignore
   * @swagger
   * /routes/int/v1/exports/administration:
   *   get:
   *     summary: Export Administration Route
   *     description: Gets the study and sites data
   *     tags:
   *       - Exports
   *     requestBody:
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *     security:
   *       - DataExportsBasicAuth: []
   *     responses:
   *       200:
   *         description: OK
   *       401:
   *         description: Unauthorized
   *       400:
   *         description: Bad Request
   */
  @log({ traceResult: true, traceError: true })
  @route('GET /int/v1/exports/administration', {
    acl: 'account.anonymous',
    apiKey: 'int__platform',
  })
  @as('c_system_user', {
    safe: false,
    principal: { skipAcl: true, grant: 'read' },
  })
  static administration({ body, res }) {
    const validateFeature = this.validateFeature('int__exports_admin', body());

    if (validateFeature.error) {
      const ResponseData = validateFeature.result.ResponseData;
      res.setStatusCode(ResponseData.ResponseCode);
      return ResponseData;
    }

    const response = new Pipeline('int__exports_admin')
      .process();

    res.setStatusCode(response.statusCode || response.ResponseCode);
    return response.body || this.returnRes(response);
  }

  static validateFeature(pipeline) {
    const pipelineObj = org.objects.int__pipeline.find({ int__identifier: pipeline });

    if (!pipelineObj.hasNext()) {
      return IntFaults.throwError('integrations.invalidArgument.invalidPipeline');
    }

    if (!Utils.isVendorEnabled(ExportsVendor.VENDOR) || !Utils.isPipelineEnabled(pipeline)) {
      return IntFaults.throwError('integrations.invalidArgument.featureDisabled');
    }

    return { error: false };
  }

  static processAirflowPipeline(pipeline, payload) {
    const token = Utils.createToken();
    return new Pipeline(pipeline)
      .process({ ...payload, token });
  }

}

module.exports = ExportsVendor;