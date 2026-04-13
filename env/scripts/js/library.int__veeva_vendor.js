/**
 * DO NOT CUSTOMIZE THIS FILE!
 * Upgrading the integrations-platform package version will overwrite any changes.
 */

import { as, log, route, trigger } from 'decorators';
import { toLower, trim } from 'lodash';
import Pipeline from 'int__pipeline';
import Utils from 'int__utils';
import VeevaSetup from 'int__veeva_setup';

/**
 * @classdesc Veeva Vendor routes and triggers
 * @class
 */
export class VeevaVendor {

  static VENDOR = 'int__veeva';

  /*
   *  ___          _
   * | _ \___ _  _| |_ ___ ___
   * |   / _ \ || |  _/ -_|_-<
   * |_|_\___/\_,_|\__\___/__/
   */

  /**
   * @ignore
   * @swagger
   * /routes/int/v1/veeva/config:
   *   put:
   *     summary: Veeva Config Route
   *     description: Updates the Veeva integration config
   *     tags:
   *       - Veeva
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
   *             Veeva Config:
   *               value:
   *                 enabled: true
   *                 pipelines:
   *                   - int__enabled: true
   *                     int__identifier: int__veeva_ping
   *                 secrets:
   *                   - int__identifier: int__veeva_base_url
   *                     int__value: ""
   *                   - int__identifier: int__veeva_password
   *                     int__value: ""
   *                   - int__identifier: int__veeva_username
   *                     int__value: ""
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
  @route('PUT /int/v1/veeva/config', {
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
      vendor: VeevaVendor.VENDOR,
      enabled,
      pipelines,
      secrets,
    });
  }

  /**
   * @ignore
   * @swagger
   * /routes/int/v1/veeva/ping:
   *   get:
   *     summary: Veeva Ping Route
   *     description: Gets the site data from Veeva
   *     tags:
   *       - Veeva
   *     responses:
   *       200:
   *         description: OK
   *       401:
   *         description: Unauthorized
   *       400:
   *         description: Bad Request
   */
  @log({ traceResult: true, traceError: true })
  @route('GET /int/v1/veeva/ping', {
    acl: 'account.anonymous',
    apiKey: 'int__platform',
  })
  @as('c_system_user', {
    safe: false,
    principal: { skipAcl: true, grant: 'read' },
  })
  static ping({ res } = {}) {
    const validateFeature = Utils.validateFeature(VeevaVendor.VENDOR, 'int__veeva_ping');

    if (validateFeature.error) {
      const ResponseData = validateFeature.result.ResponseData;
      res && res.setStatusCode(ResponseData.ResponseCode);
      return ResponseData;
    }

    const response = new Pipeline('int__veeva_ping')
      .process();

    const statusCode = (response && response.ResponseCode) || 200;
    res.setStatusCode(statusCode);
    return response.body || response;
  }

  /**
   * @ignore
   * @swagger
   * /routes/int/v1/veeva/mapping:
   *   post:
   *     summary: Veeva Mapping Route
   *     description: Creates mapping objects for Veeva
   *     tags:
   *       - Veeva
   *     requestBody:
   *       required: false
   *       content: {}
   *     responses:
   *       200:
   *         description: OK
   *       403:
   *         description: Unauthorized
   */
    @route('POST /int/v1/veeva/mapping', {
      acl: 'role.administrator',
      apiKey: 'int__platform',
    })
    @as('c_system_user', {
      safe: false,
      principal: { skipAcl: true, grant: 'update' },
    })
  static createMapping() {
    return VeevaSetup.mapping();
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
    object: 'ec__signed_document',
    weight: 1,
    principal: 'c_system_user',
    if: {
      $check__ec_document_status: '$$ROOT',
    },
    rootDocument: 'runtime',
  })
    static subsequentEconsentSigned(data) {
      if (Utils.isVendorEnabled(VeevaVendor.VENDOR) && Utils.isPipelineEnabled('int__veeva_sub_reg_ec')) {
        const { context, old } = data;

        const participantId = old.ec__primary_participant._id;
        const user = org.objects.c_public_user.readOne({ _id: participantId })
          .throwNotFound(false)
          .skipAcl()
          .grant('read')
          .execute();

        const documentTemplate = org.objects.ec__document_template.readOne({ _id: old.ec__document_template._id })
          .execute();

        const isIntegratedDocument = documentTemplate.ec__custom_data.some((d) => {
          return toLower(trim(d.ec__label)) === 'integrated consent document' && toLower(trim(d.ec__value)) === 'yes';
        });

        if (isIntegratedDocument && (!user.c_number && user.c_status === 'new')) {
          org.objects.c_public_user.updateOne(
            { _id: participantId },
            {
              $set: {
                c_status: 'Consented',
              },
            },
          )
            .skipAcl()
            .grant('update')
            .execute();

          new Pipeline('int__veeva_sub_reg_ec')
            .queue({ _id: context._id, int__sequence: participantId }, { retryCount: 5 });
        }
      }
    }

}