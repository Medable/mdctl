/**
 * DO NOT CUSTOMIZE THIS FILE!
 * Upgrading the integrations-platform package version will overwrite any changes.
 */

import faults from 'c_fault_lib';
import IntUtils from 'int__utils';
import IntQueue from 'int__queue';

/**
 * @classdesc Processes tasks in given pipeline
 * @class
 */
class Pipeline {

  static TYPE = {
    SCRIPT: 'script',
  };

  constructor(int__identifier, queueId = null, transactionId = null) {
    this.int__identifier = int__identifier;
    this.queueId = queueId;

    this.int__pipeline = this.getPipeline();
    this.int__transaction = transactionId || IntUtils.uuidv4();
    this.int__queue = this.getQueue();
    this.int__tasks = this.getPipelineTasks();
    this.int__vendor = this.getPipelineVendor();
    this.int__secrets = this.getPipelineVendorSecrets();

    this.isPipelineEnabled();
  }

  getQueue() {
    return this.queueId
      ? org.objects.int__queue.find({
        _id: this.queueId,
      })
        .next()
      : null;
  }

  getPipeline() {
    const pipeline = org.objects.int__pipeline.find({
      int__identifier: this.int__identifier,
    });

    if (!pipeline.hasNext()) faults.throw('integrations.invalidArgument.invalidPipeline');

    return pipeline.next();
  }

  getPipelineTasks() {
    return org.objects.int__tasks.find({
      int__pipeline: this.int__pipeline._id,
    })
      .expand(['int__expression'])
      .sort({ int__index: 1 })
      .toArray();
  }

  getPipelineVendor() {
    return org.objects.int__vendor.find({
      _id: this.int__pipeline.int__vendor._id,
    })
      .next();
  }

  getPipelineVendorSecrets() {
    const secrets = org.objects.int__secret.find({
      int__vendor: this.int__pipeline.int__vendor._id,
    })
      .expand(['int__value'])
      .toArray();

    return (secrets || []).reduce((obj, item) => {
      return Object.assign(obj, { [item.int__identifier]: item });
    }, {});
  }

  isPipelineEnabled() {
    if (!this.int__vendor.int__enabled || !this.int__pipeline.int__enabled) {
      faults.throw('integrations.invalidArgument.featureDisabled');
    }
  }

  queue(_event, {
    retryCount = 5,
    status = IntQueue.STATUS.QUEUED,
  } = {}) {

    return org.objects.int__queue.insertOne({
      int__message: _event,
      int__pipeline: this.int__pipeline._id,
      int__vendor: this.int__pipeline.int__vendor._id,
      int__sequence: _event.int__sequence,
      int__retry_count: retryCount,
      int__status: status,
    })
      .execute();
  }

  process(_event = {}) {
    try {
      let event = _event;

      for (const int__task of this.int__tasks) {
        const context = {
          int__transaction: this.int__transaction,
          int__task: int__task,
          int__queue: this.int__queue,
          int__pipeline: this.int__pipeline,
          int__vendor: this.int__vendor,
          int__secrets: this.int__secrets,
        };

        switch (int__task.int__type) {
          case Pipeline.TYPE.SCRIPT: {
            const Task = require(int__task.int__action);
            event = (event && !event.skip)
              ? new Task(context, event).process() : // eslint-disable-line
              {};
          }
        }
      }

      return event;
    } catch (err) {
      if (this.int__queue) {
        throw err;
      } else {
        return {
          Success: false,
          Message: err.reason || 'Script Error',
          ResponseCode: '400',
        };
      }

    }

  }

}

module.exports = Pipeline;