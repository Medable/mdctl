/**
 * DO NOT CUSTOMIZE THIS FILE!
 * Upgrading the integrations-platform package version will overwrite any changes.
 */

// import faults from 'c_fault_lib';
import { log } from 'decorators';
import httpClient from 'http';
import {
  isObject,
  isString,
} from 'lodash';
import logger from 'logger';

import Task from 'int__task';
import Utils from 'int__utils';

/**
 * @classdesc Generic task to make API requests
 * @class
 * @augments Task
 */
class ApiRequestTask extends Task {

  /**
   * This function generates the request url from data in "event"
   * @returns {string}
   */
  generateRequestUrl() {
    const { domain, method, path, query } = this.event;

    const url = `${domain}${path}`;

    const hasQuery = method.toUpperCase() === 'GET' && query;
    const queryString = hasQuery ? this.stringifyQuery(query) : null;

    return queryString ? `${url}?${queryString}` : url;
  }

  /**
   * This function stringifies the request body
   * @returns {string}
   */
  getRequestBody() {
    const { body, isXML = false } = this.event;

    if (isXML) {
      return Utils.toXML(body);
    } else { return (!isString(body) && isObject(body)) ? JSON.stringify(body) : body; }
  }

  /**
   * This function processes the ApiRequestTask
   * @returns {Object}
   */
  @log({ traceError: true })
  _process() {
    const {
      buffer,
      headers,
      method,
      sslOptions,
      strictSSL,
      timeout,
      gzip,
      failOnStatusCode = false,
      isXML = false,
    } = this.event;

    const url = this.generateRequestUrl();

    const options = {
      body: this.getRequestBody(),
      buffer,
      headers,
      sslOptions,
      strictSSL,
      timeout,
      gzip,
    };

    const result = httpClient[method.toLowerCase()](url, options);

    let body;

    let isError = false;
    if (failOnStatusCode) {
      if (result.statusCode >= 400) {
        isError = true;
      }
      if (!(result.headers['content-type'].includes('text/html') || result.headers['content-type'].includes('text/xml') || isXML)) {
        const resultBody = JSON.parse(result.body);
        if (resultBody) { // error handling for Veeva vendor
          if (resultBody.responseStatus === 'FAILURE') {
            isError = true;
          }
          if (resultBody.subjects && resultBody.subjects.length && resultBody.subjects[0].responseStatus === 'FAILURE') {
            isError = true;
          }
        }
      }
    }
    if (isError) {
      logger.error(result.body);
      // faults.throw('integrations.invalidArgument.failOnStatusCode');
      throw new Error(result.body);

    }

    if (result.headers['content-type'].includes('text/html') || result.headers['content-type'].includes('text/xml') || isXML) {
      return {
        body: result.body,
        statusCode: result.statusCode,
      };
    } else {
      body = result.body ? JSON.parse(result.body) : '';
      return {
        body,
        statusCode: result.statusCode,
      };
    }

  }

}

module.exports = ApiRequestTask;