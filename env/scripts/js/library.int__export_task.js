/**
 * DO NOT CUSTOMIZE THIS FILE!
 * Upgrading the integrations-platform package version will overwrite any changes.
 */

import { log } from 'decorators';
import { Job } from 'renderer';

import Task from 'int__task';

/**
 * @classdesc Generic task to process exports jobs with cortex renderer
 * @class
 * @augments Task
 */
class ExportTask extends Task {

  static STATUS = {
    PROCESS_INITIATED: 'Process Initiated',
    IN_PROGRESS: 'In Progress',
  }

  @log({ traceError: true })
  _process() {
    const job = new Job('c_axon_demo_app');

    const int__transaction = this.context.int__transaction;
    const execution = org.objects.int__dt_execution.insertOne({
      int__key: int__transaction,
      int__copy: `${int__transaction}.${this.event.type}`,
    })
      .skipAcl()
      .grant(6)
      .execute();

    const jobResponse = job
      .addCursor(
        'data',
        org.objects.account.find({ _id: null })
          .expressionPipeline(this.event.expression),
      )
      .addTemplate(
        `tpl_${int__transaction}`,
        this.event.template,
      )
      .addOutput(
        int__transaction, this.event.type,
        [`tpl_${int__transaction}`],
      )
      .addFileTarget(
        `int__dt_execution/${execution}/int__copy`,
        {
          facets: {
            content: int__transaction,
          },
          compress: {
            facet: int__transaction,
          },
        },
      )
      .addCallback(
        '/routes/int/v1/exports/callback',
        {
          endpoint: `https://${script.env.host}`,
          env: script.org.code,
        },
        {
          type: 'token',
          token: ExportTask.getCallbackToken(),
        },
        {
          json: true,
          body: {
            executionId: execution,
          },
        },
      )
      .start();

    org.objects.int__dt_execution.updateOne(
      {
        _id: execution,
      },
      {
        $set: {
          int__dt_renderer_key: jobResponse.jobId,
        },
      },
    )
      .skipAcl()
      .grant(8)
      .execute();

    if (jobResponse && jobResponse.status !== ExportTask.STATUS.PROCESS_INITIATED) {
      return {
        statusCode: jobResponse.status,
        message: jobResponse.reason,
      };
    } else {
      return {
        jobId: execution,
        message: ExportTask.STATUS.IN_PROGRESS,
      };
    }
  }

  static getCallbackToken() {
    const AXON_APP = 'c_axon_demo_app';
    const DEFAULT_TOKEN_EXPIRATION = 43200; // seconds
    return org.objects.accounts.createAuthToken(AXON_APP, script.principal, {
      scope: [
        'object.*.int__dt_execution',
        'object.read.account',
        'object.read.org',
        'script.execute.route',
      ],
      expiresIn: DEFAULT_TOKEN_EXPIRATION,
      includeEmail: true,
      maxUses: 1,
      policy: [{
        method: 'POST',
        path: [
          '/routes/int/v1/exports/callback',
        ],
      }],
    });
  }

}

module.exports = ExportTask;