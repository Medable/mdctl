/**
 * DO NOT CUSTOMIZE THIS FILE!
 * Upgrading the integrations-platform package version will overwrite any changes.
 */
import { log } from 'decorators';
import {
  run,
  pipeline,
} from 'expressions';
import {
  keys,
  isObject,
} from 'lodash';

import Task from 'int__task';

/**
 * @classdesc Generic task to process cortex expression
 * @class
 * @augments Task
 */
class ExpressionTask extends Task {

  /**
   * This function runs the expression or expression-pipeline
   * @param {Object} obj expression data
   * @param {Object} context context for expression
   * @returns {Object}
   */
  resolveExpressions(obj = {}, context = {}) {
    // eslint-disable-next-line prefer-const
    const result = { ...obj };

    if (result.type) {
      let data;

      if (result.context) {
        data = this.resolveExpressions(result.context, context);
      }

      switch (result.type) {
        case 'expression':
          return run(result.expression, { ...context, data });
        case 'expression-pipeline':
          return pipeline.run(result.expression, [{ ...context, data }])
            .toArray();
      }
    }

    const props = keys(result);

    props.forEach(prop => {
      if (isObject(result[prop])) {

        result[prop] = this.resolveExpressions(result[prop], context);
      }
    });

    return result;
  }

  /**
   * This function processes the ExpressionTask
   * @returns {Object}
   */
  @log({ traceError: true })
  _process() {
    const {
      int__expression: {
        int__data,
      },
    } = this.context.int__task;

    return this.resolveExpressions(int__data, {
      context: this.context,
      event: this.event,
    });

  }

}

module.exports = ExpressionTask;