/**
 * DO NOT CUSTOMIZE THIS FILE!
 * Upgrading the integrations-platform package version will overwrite any changes.
 */

import { log } from 'decorators';

import Task from 'int__task';
/**
 * @classdesc Generic task to create, update, delete object instances
 * @class
 * @augments Task
 */
class CursorTask extends Task {

  /**
   * This function processes the CursorTask
   * @returns {Object}
   */
  @log({ traceError: true })
  _process() {
    const request = org.objects[this.event.object][this.event.action](...this.event.arguments);

    if (this.event.execute) return request.execute();

    return request;
  }

}

module.exports = CursorTask;