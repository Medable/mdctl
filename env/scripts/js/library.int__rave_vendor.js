/**
 * Upgrading the integrations-platform package version will overwrite any changes.
 */

import {
  as,
  log,
  route,
  trigger,
} from 'decorators';
import Utils from 'int__utils';
import Pipeline from 'int__pipeline';

/**
 * Change this import to study specific helper file if required
 */
import RaveHelper from 'int__rave_helper';

/**
 * @classdesc Rave Vendor routes and triggers
 * @class
 */
class RaveVendor {

  static VENDOR = 'int__rave';
  /*
   *  ___          _
   * | _ \___ _  _| |_ ___ ___
   * |   / _ \ || |  _/ -_|_-<
   * |_|_\___/\_,_|\__\___/__/
   */

  /**
   * @ignore
   * @swagger
   * /routes/int/v1/rave/config:
   *   put:
   *     summary: Rave Config Route
   *     description: Updates the Rave integration config
   *     tags:
   *       - Rave
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
   *             Rave Config:
   *               value:
   *                 enabled: true
   *                 pipelines:
   *                   - int__enabled: true
   *                     int__identifier: int__rave_ping
   *                   - int__enabled: true
   *                     int__identifier: int__rave_ecrf_update
   *                     c_task: ["cef306bb-5eb4-48ef-ae4c-84b128f2962b", "2e80e7c9-d99b-49f7-9148-ddeb7f5a5ec9", "0806c493-9fc8-4a7f-9d0a-6fdfe0153c3d"]
   *                 secrets:
   *                   - int__identifier: int__rave_access_token
   *                     int__value: ""
   *                   - int__identifier: int__rave_base_url
   *                     int__value: ""
   *                   - int__identifier: int__rave_study_oid
   *                     int__value: ""
   *                   - int__identifier: int__rave_meta_version_oid
   *                     int__value: ""
   *                   - int__identifier: int__rave_odm_url
   *                     int__value: ""
   *                   - int__identifier: int__rave_odm_version
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
  @route('PUT /int/v1/rave/config', {
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
      vendor: RaveVendor.VENDOR,
      enabled,
      pipelines,
      secrets,
    });
  }

  /**
   * @ignore
   * @swagger
   * /routes/int/v1/rave/ping:
   *   get:
   *     summary: Rave Ping Route
   *     description: Gets the site data from Rave
   *     tags:
   *       - Rave
   *     responses:
   *       200:
   *         description: OK
   *       400:
   *         description: Bad Request
   */
  @log({ traceResult: true, traceError: true })
  @route('GET /int/v1/rave/ping', {
    acl: 'role.administrator',
    apiKey: 'int__platform',
  })
  @as('c_system_user', {
    safe: false,
    principal: { skipAcl: true, grant: 'read' },
  })
  static ping({ res } = {}) {
    const validateFeature = Utils.validateFeature(RaveVendor.VENDOR, 'int__rave_ping');

    if (validateFeature.error) {
      const ResponseData = validateFeature.result.ResponseData;
      res && res.setStatusCode(ResponseData.ResponseCode);
      return ResponseData;
    }

    const response = new Pipeline('int__rave_ping')
      .process();

    res && res.setStatusCode(response.statusCode || response.ResponseCode);

    return response;
  }

  /**
   * @ignore
   * @swagger
   * /routes/int/v1/rave/mapping:
   *   post:
   *     summary: Rave Mapping Route
   *     description: Stores Task Mapping for Rave
   *     tags:
   *       - Rave
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               tasks:
   *                 type: array
   *                 items:
   *                   properties:
   *                     c_task:
   *                       type: string
   *                     form_id:
   *                       type: string
   *                     item_group_id:
   *                       type: string
   *                     item_id:
   *                       type: string
   *                     item_group_repeat_key:
   *                       type: string
   *               sites:
   *                 type: array
   *                 items:
   *                   properties:
   *                     c_site:
   *                       type: string
   *                     c_number:
   *                       type: string
   *           examples:
   *             Rave Mapping:
   *               value:
   *                 tasks:
   *                    - c_task: 955850cd-684d-4a5f-96d4-5bf09abd467f
   *                      form_id: ECOA
   *                      item_group_id: ECOA_LOG_LINE
   *                      item_id: ECOADAT
   *                      item_group_repeat_key: 1
   *                 sites:
   *                   - c_site: 61938dba-9392-4b0b-87ba-d2b0b4452001
   *                     c_number: ePRO 01
   *
   *     responses:
   *       200:
   *         description: OK
   *       401:
   *         description: Not authenticated
   *       403:
   *         description: Unauthorized
   */
  @route('POST /int/v1/rave/mapping', {
    acl: 'role.administrator',
    apiKey: 'int__platform',
  })
  @as('c_system_user', {
    safe: false,
    principal: { skipAcl: true, grant: 'update' },
  })
  static createMapping({ body }) {
    const {
      tasks = [],
      sites = [],
    } = body();

    const vendor = org.objects.int__vendor.readOne({
      int__identifier: RaveVendor.VENDOR,
    })
      .paths('_id')
      .execute();

    // eslint-disable-next-line array-callback-return
    tasks.map(task => {

      const taskObj = org.objects.c_task.readOne({
        c_key: task.c_task,
      })
        .paths('_id')
        .execute();

      const formBody = {
        int__external_id: task.form_id,
        int__medable_task: taskObj._id,
        int__vendor: vendor._id,
        type: 'int__regular',
      };

      let existingForm = org.objects.int__form
        .find({
          int__medable_task: taskObj._id,
          int__vendor: vendor._id,
        })
        .skipAcl()
        .grant('read');

      if (existingForm.count() === 0) {
        existingForm = org.objects.int__form
          .insertOne(formBody)
          .bypassCreateAcl()
          .grant('update')
          .execute();
      } else {
        existingForm = org.objects.int__form
          .updateOne(
            {
              int__medable_task: taskObj._id,
            },
            { $set: formBody },
          )
          .skipAcl()
          .grant('update')
          .execute();
      }

      const itemBody = {
        int__external_id: task.item_id,
        int__external_group_id: task.item_group_id,
        int__external_group_repeat_key: task.item_group_repeat_key,
        int__vendor: vendor._id,
        type: 'int__regular',
        int__external_name: 'Date of Completion',
        int__form: existingForm,
      };

      const existingItem = org.objects.int__question
        .find({
          int__external_id: task.item_id,
          int__form: existingForm,
        })
        .skipAcl()
        .grant('read');

      if (existingItem.count() === 0) {
        org.objects.int__question
          .insertOne(itemBody)
          .bypassCreateAcl()
          .grant('update')
          .execute();
      } else {
        org.objects.int__question
          .updateOne(
            {
              int__external_id: task.item_id,
              int__form: existingForm,
            },
            { $set: itemBody },
          )
          .skipAcl()
          .grant('update')
          .execute();
      }
    });

    // eslint-disable-next-line array-callback-return
    sites.map(site => {

      const siteObj = org.objects.c_site.readOne({
        c_key: site.c_site,
      })
        .paths('_id')
        .execute();

      const siteParams = {
        int__vendor_site: site.c_number,
        int__medable_site: siteObj._id,
        int__vendor: vendor._id,
      };

      const existingSite = org.objects.int__site
        .find({
          int__medable_site: siteObj._id,
          int__vendor: vendor._id,
        })
        .skipAcl()
        .grant('read');

      if (existingSite.count() === 0) {
        org.objects.int__site
          .insertOne(siteParams)
          .bypassCreateAcl()
          .grant('update')
          .execute();
      } else {
        org.objects.int__site
          .updateOne(
            {
              int__medable_site: siteObj._id,
              int__vendor: vendor._id,
            },
            { $set: siteParams },
          )
          .skipAcl()
          .grant('update')
          .execute();
      }

    });

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
    if (Utils.isVendorEnabled(RaveVendor.VENDOR)) {
      const pipelines = Utils.fetchPipelinesFromTaskResponse(
        context._id,
        RaveVendor.VENDOR,
      );

      const { eventId = '', eventRepeatKey = '', visitName } = RaveHelper.calculateVisit(context._id);

      for (const pipeline of pipelines) {

        new Pipeline(pipeline.int__identifier)
          .queue({ _id: context._id, int__sequence: old.c_public_user._id, eventId, eventRepeatKey, visitName }, { retryCount: 5 });

      }
    }
  }

}

module.exports = RaveVendor;