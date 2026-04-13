/**
 * DO NOT CUSTOMIZE THIS FILE!
 * Upgrading the integrations-platform package version will overwrite any changes.
 */

import base64 from 'base64';
import { get } from 'lodash';

const IntFaults = require('int__faults');
/**
 * @classdesc Common utils across integration vendors
 * @class
 */
class Utils {

  /**
   * This function generates a uuidv4
   * @returns {string}
   */
  static uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = (Math.random() * 16) | 0,
        v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * This function checks the authentication header with stored username and password
   * @param {Object} req Route request
   * @param {string} username Username to validate
   * @param {string} password Password to validate
   * @returns {boolean}
   */
  static isValidAuthenticationHeader(req, username, password) {
    const { headers: { authorization } = {} } = req;

    if (!authorization) return false;

    const CREDENTIALS_REGEXP = /^ *(?:[Bb][Aa][Ss][Ii][Cc]) +([A-Za-z0-9._~+/-]+=*) *$/;
    const USER_PASS_REGEXP = /^([^:]*):(.*)$/;

    if (
      authorization &&
      CREDENTIALS_REGEXP.exec(authorization) &&
      USER_PASS_REGEXP.exec(base64.decode(CREDENTIALS_REGEXP.exec(authorization)[1]))
    ) {
      const match = USER_PASS_REGEXP.exec(base64.decode(CREDENTIALS_REGEXP.exec(authorization)[1]));

      return (username === match[1]) && (password === match[2]);
    }

    return false;
  }

  /**
   * This function updates the int__pipeline object instances for a specific vendor
   * @param {string} vendor int__vendor -> int__identifier
   * @param {Array<Object>} pipelines Array of pipelines
   * @returns {Array<Object>}
   */
  static updateIntPipelines(vendor, pipelines) {
    const int__vendor = org.objects.int__vendor.find({
      int__identifier: vendor,
    })
      .next();

    return pipelines.map(pipeline => {
      if (
        org.objects.int__pipeline.find({
          int__identifier: pipeline.int__identifier,
          int__vendor: int__vendor._id,
        })
          .hasNext() && pipeline.int__enabled !== undefined
      ) {
        org.objects.int__pipeline.updateOne({
          int__identifier: pipeline.int__identifier,
        }, {

          $set: {
            int__enabled: get(pipeline, 'int__enabled'),
            int__statuses: pipeline.int__statuses ? pipeline.int__statuses : [],
            c_task: pipeline.c_task ? pipeline.c_task : [],
            int__include_pii: pipeline.int__include_pii ? pipeline.int__include_pii : {},
            c_steps: pipeline.c_steps ? pipeline.c_steps : {},
          },
        })
          .execute();
      }

      const int__pipeline = org.objects.int__pipeline.find({ int__identifier: pipeline.int__identifier })
        .next();

      return {
        int__identifier: int__pipeline.int__identifier,
        int__enabled: int__pipeline.int__enabled,
      };
    });
  }

  /**
   * This function updates the int__secret object instances for a specific vendor
   * @param {string} vendor int__vendor -> int__identifier
   * @param {Array<Object>} secrets Array of secrets
   * @returns {Array<Object>}
   */
  static updateIntSecrets(vendor, secrets) {
    const int__vendor = org.objects.int__vendor.find({
      int__identifier: vendor,
    })
      .next();

    return secrets.map(secret => {
      if (
        org.objects.int__secret.find({
          int__identifier: secret.int__identifier,
          int__vendor: int__vendor._id,
        })
          .hasNext() && secret.int__value !== undefined
      ) {
        org.objects.int__secret.updateOne({
          int__identifier: secret.int__identifier,
        }, {
          $set: {
            int__value: secret.int__value,
          },
        })
          .execute();
      }

      const int__secret = org.objects.int__secret.find({ int__identifier: secret.int__identifier })
        .expand(['int__value'])
        .next();

      return {
        int__identifier: int__secret.int__identifier,
        int__value: int__secret.int__value,
      };
    });
  }

  /**
   * This function updates the configuration for a given vendor
   * @param {Object} data Array of secrets
   * @param {boolean} data.enabled Vendor enabled flag
   * @param {string} data.vendor Vendor identifier
   * @param {Array<Object>} data.pipelines Vendor pipelines
   * @param {Array<Object>} data.secrets Vendor secrets
   * @returns {Object}
   */
  static configRoute(data) {
    const {
      enabled,
      vendor,
      pipelines,
      secrets,
    } = data;

    // update vendor
    if (enabled !== null && enabled !== undefined) {
      org.objects.int__vendor.updateOne({
        int__identifier: vendor,
      }, {
        $set: {
          int__enabled: enabled,
        },
      })
        .execute();
    }

    // update pipelines
    this.updateIntPipelines(vendor, pipelines);

    // update secrets
    this.updateIntSecrets(vendor, secrets);

    return {
      enabled: org.objects.int__vendor.find({ int__identifier: vendor })
        .next()
        .int__enabled,
      pipelines: org.objects.int__pipelines.find({
        int__vendor: org.objects.int__vendor.find({ int__identifier: vendor })
          .next()._id,
      })
        .sort({ int__identifier: 1 })
        .map((int__pipeline) => ({
          int__identifier: int__pipeline.int__identifier,
          int__enabled: int__pipeline.int__enabled,
          int__statuses: int__pipeline.int__statuses,
          c_task: int__pipeline.c_task,
          int__include_pii: int__pipeline.int__include_pii || {},
          c_steps: int__pipeline.c_steps,
        })),
      secrets: org.objects.int__secrets.find({
        int__vendor: org.objects.int__vendor.find({ int__identifier: vendor })
          .next()._id,
      })
        .sort({ int__identifier: 1 })
        .expand(['int__value'])
        .map((int__secret) => ({
          int__identifier: int__secret.int__identifier,
          int__value: int__secret.int__value,
        })),
    };
  }

  /**
   * This function updates the configuration for a given vendor
   * @param {string} task_response_id Task response id
   * @param {string} vendor_identifier Vendor identifier
   * @returns {Array<Object>}
   */
  static fetchPipelinesFromTaskResponse(task_response_id, vendor_identifier) {
    const task_response = org.objects.c_task_response.find({
      _id: task_response_id,
    })
      .expand(['c_task'])
      .next();

    const vendor = org.objects.int__vendor.find({
      int__identifier: vendor_identifier,
    })
      .next();

    return org.objects.int__pipeline.find({
      int__vendor: vendor._id,
      int__enabled: true,
      c_task: task_response.c_task.c_key,
    })
      .toArray();
  }

  /**
   * This function returns the steps associated with the task that triggers a given pipeline
   * @param {string} task_response_id Task response id
   * @param {string} pipeline_identifier Pipeline identifier
   * @returns {Array<Object>} Array of steps and associated field names
   */
  static fetchStepsFromTaskResponse(task_response_id, pipeline_identifier) {
    const task_response = org.objects.c_task_response.find({
      _id: task_response_id,
    })
      .expand(['c_task'])
      .next();
    const task_key = task_response.c_task.c_key;

    const pipeline = org.objects.int__pipeline.find({ int__identifier: pipeline_identifier })
      .paths('c_steps')
      .next();
    return pipeline.c_steps ? pipeline.c_steps[task_key] : [];
  }

  /**
 * This function checks if integration vendor is enabled
 * @param {string} vendor_identifier Vendor identifier
 * @returns {boolean}
 */
  static isVendorEnabled(vendor_identifier) {
    const vendor = org.objects.int__vendor.find({ int__identifier: vendor_identifier });

    return vendor.hasNext() && vendor.next().int__enabled;
  }

  static isPipelineEnabled(pipeline_identifier) {
    const pipeline = org.objects.int__pipeline.find({ int__identifier: pipeline_identifier });

    return pipeline.hasNext() && pipeline.next().int__enabled;
  }

  /**
 * This function checks if integration vendor and the pipeline for the feature is enabled
 * @param {string} vendor Vendor identifier
 * @param {string} pipeline Pipeline identifier
 * @param {object} reqBody Request body in case of POST/PUT calls
 * @returns {boolean}
 */
  static validateFeature(vendor, pipeline, reqBody = {}) {
    let TransactionID;
    const eventKey = Object.keys(reqBody)[0];
    if (eventKey) {
      TransactionID = reqBody[eventKey].GeneralData.TransactionID;
    }

    if (!this.isVendorEnabled(vendor) || !this.isPipelineEnabled(pipeline)) {
      return IntFaults.throwError('integrations.invalidArgument.featureDisabled', TransactionID);
    }

    return { error: false };
  }

  /**
 * This function transforms json object to XML
 * @param {object} obj Request body in case of POST/PUT calls
 * @returns {string}
 */
  static toXML(obj = {}) {
    let XML = '';

    for (const prop in obj) {
      if (!(prop.startsWith('_'))) {
        XML += obj[prop] instanceof Array ? '' : '<' + prop;

        const attrs = Object.keys(obj[prop])
          .filter(k => k.startsWith('_'));

        for (const attr of attrs) {
          if (attr !== '__text') { XML = `${XML} ${attr.replace(/_/g, '')} = "${obj[prop][attr]}"`; }
        }

        XML = `${XML} >`;

        if (obj[prop].__text) { XML = `${XML} ${obj[prop].__text}`; }

        if (obj[prop] instanceof Array) {
          for (const array in obj[prop]) {
            XML += '<' + prop + '>';
            XML += this.toXML(obj[prop][array]);
            XML += '</' + prop + '>';
          }
        } else if (typeof obj[prop] === 'object') {
          XML += this.toXML(obj[prop]);
        } else {
          XML += obj[prop];
        }

        XML += obj[prop] instanceof Array ? '' : '</' + prop + '>';
      }

    }
    XML = XML.replace(/<\/?[0-9]{1,}>/g, '');
    return XML;
  }

  /**
   * Function that retrieves token from Cortex
   * @returns {string}
   */
  static createToken() {
    return org.objects.account.createAuthToken('c_sql_service_app', script.principal._id);
  }

}

module.exports = Utils;