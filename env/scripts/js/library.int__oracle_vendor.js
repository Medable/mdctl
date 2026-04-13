/**
 * DO NOT CUSTOMIZE THIS FILE!
 * Upgrading the integrations-platform package version will overwrite any changes.
 */

import {
  log,
  trigger,
  as,
  route,
} from 'decorators';

import Pipeline from 'int__pipeline';
import Utils from 'int__utils';
import OracleSetup from 'int__oracle_setup';
import moment from 'moment';

/**
 * @classdesc Oracle Vendor routes and triggers
 * @class
 */
class OracleVendor {

  static VENDOR = 'int__oracle';

  /*
   *  ___          _
   * | _ \___ _  _| |_ ___ ___
   * |   / _ \ || |  _/ -_|_-<
   * |_|_\___/\_,_|\__\___/__/
  */

  /**
   * @ignore
   * @swagger
   * /routes/int/v1/oracle/config:
   *   put:
   *     summary: Oracle Config Route
   *     description: Updates the Oracle integration config
   *     tags:
   *       - Oracle
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
   *             Oracle Config:
   *               value:
   *                 enabled: true
   *                 pipelines:
   *                   - int__enabled: true
   *                     int__identifier: int__oracle_sub_reg_ec
   *                   - int__enabled: true
   *                     int__identifier: int__oracle_tr
   *                   - int__enabled: true
   *                     int__identifier: int__oracle_tr_repeating
   *                   - int__enabled: true
   *                     int__identifier: int__oracle_tlv
   *                 secrets:
   *                   - int__identifier: int__oracle_auth_domain
   *                     int__value: ""
   *                   - int__identifier: int__oracle_auth_grant_type
   *                     int__value: ""
   *                   - int__identifier: int__oracle_auth_path
   *                     int__value: ""
   *                   - int__identifier: int__oracle_auth_scope
   *                     int__value: ""
   *                   - int__identifier: int__oracle_base_url
   *                     int__value: ""
   *                   - int__identifier: int__oracle_mode
   *                     int__value: ""
   *                   - int__identifier: int__oracle_nodata_flag
   *                     int__value: ""
   *                   - int__identifier: int__oracle_study
   *                     int__value: ""
   *                   - int__identifier: int__oracle_study_version
   *                     int__value: ""
   *                   - int__identifier: int__oracle_username
   *                     int__value: ""
   *                   - int__identifier: int__oracle_password
   *                     int__value: ""
   *     responses:
   *       200:
   *         description: OK
   *       401:
   *         description: Not authenticated
   *       403:
   *         description: Unauthorized
   */
  @log({ traceResult: true, traceError: true })
  @route('PUT /int/v1/oracle/config', {
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
      vendor: OracleVendor.VENDOR,
      enabled,
      pipelines,
      secrets,
    });
  }

  /**
   * @ignore
   * @swagger
   * /routes/int/v1/oracle/mapping:
   *   post:
   *     summary: Oracle Mapping Route
   *     description: Creates mapping objects for Oracle
   *     tags:
   *       - Oracle
   *     requestBody:
   *       required: false
   *       content: {}
   *     responses:
   *       200:
   *         description: OK
   *       401:
   *         description: Not authenticated
   *       403:
   *         description: Unauthorized
   */
  @route('POST /int/v1/oracle/mapping', {
    acl: 'role.administrator',
    apiKey: 'int__platform',
  })
  @as('c_system_user', {
    safe: false,
    principal: { skipAcl: true, grant: 'update' },
  })
  static createMapping({ body }) {
    return OracleSetup.mapping();
  }

  /**
   * @ignore
   * @swagger
   * /routes/int/v1/oracle/mapping/{id}:
   *   get:
   *     summary: Oracle Mapping Status Route
   *     description: Fetches mapping status for Oracle
   *     tags:
   *       - Oracle
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *          type: string
   *     responses:
   *       200:
   *         description: OK
   *       401:
   *         description: Not authenticated
   *       403:
   *         description: Unauthorized
   */
  @route({
    method: 'GET',
    name: 'orac__check_mapping_status',
    path: '/int/v1/oracle/mapping/:bulkOpId',
    acl: 'role.administrator',
    apiKey: 'int__platform',
  })
  @as('c_system_user', {
    safe: false,
    principal: { skipAcl: true, grant: 'update' },
  })
  static fetchMappingStatus({ req }) {
    const { bulkOpId } = req.params;
    return OracleSetup.getStatus(bulkOpId);
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
    if (Utils.isVendorEnabled(OracleVendor.VENDOR)) {

      new Pipeline('int__oracle_sub_reg_ec')
        .queue({ _id: context._id, int__sequence: old.ec__primary_participant._id }, { retryCount: 5 });
    }
  }

  @trigger('update.after', {
    object: 'c_task_response',
    principal: 'c_system_user',
    weight: 1,
    if: {
      $and: [
        {
          $gte: [
            {
              $indexOfArray: ['$$SCRIPT.arguments.modified', 'c_completed'],
            },
            0,
          ],
        },
        {
          $eq: ['$$ROOT.c_completed', true],
        },
      ],
    },
  })
  afterCreateTaskResponse(data) {
    const { context, old } = data;
    if (Utils.isVendorEnabled(OracleVendor.VENDOR)) {
      const taskR = org.objects.c_task_response
        .readOne({ _id: context._id })
        .skipAcl()
        .grant('read')
        .execute();

      const oracForm = org.objects.int__form
        .readOne({ int__medable_task: taskR.c_task._id })
        .skipAcl()
        .grant('read')
        .throwNotFound(false)
        .execute();

      let pipeline = 'int__oracle_tr';
      if (oracForm.int__repeating_form) { pipeline = 'int__oracle_tr_repeating'; };

      new Pipeline(pipeline)
        .queue({ _id: context._id, int__sequence: old.c_public_user._id }, { retryCount: 5 });
    }

  }

  @log({ traceError: true })
  @trigger('update.after', {
    object: 'c_call',
    principal: 'c_system_user',
    weight: 1,
    if: {
      $and: [
        {
          $gte: [
            {
              $indexOfArray: ['$$SCRIPT.arguments.modified', 'c_status'],
            },
            0,
          ],
        },
        {
          $eq: ['$$ROOT.c_status', 'finished'],
        },
      ],
    },
  })
  afterCallFinished({
    context,
    runtime: {
      metadata: { className: connectorName },
    },
  }) {

    const callObj = org.objects.c_call
      .find({ _id: context._id })
      .expand(['c_room'])
      .skipAcl()
      .grant('read')
      .next();

    const { _d: callEndTime } = moment(callObj.created)
      .add(
        callObj.c_room.duration,
        'seconds',
      );

    new Pipeline('int__oracle_tlv')
      .queue({ _id: context._id, callEndTime, int__sequence: callObj.c_public_user._id }, { retryCount: 5 });

  }

}

module.exports = OracleVendor;