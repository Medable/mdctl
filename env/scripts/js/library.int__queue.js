/**
 * DO NOT CUSTOMIZE THIS FILE!
 * Upgrading the integrations-platform package version will overwrite any changes.
 */

import { job, trigger, log, as, route } from 'decorators';
import faults from 'c_fault_lib';
import logger from 'logger';
import IntPipeline from 'int__pipeline';
import IntNotification from 'int__notification';

/**
 * @classdesc Queue class to process pipelines asynchronously
 * @class
 */
class Queue {

  static STATUS = {
    SCHEDULED: 'scheduled',
    QUEUED: 'queued',
    IN_PROGRESS: 'in-progress',
    COMPLETED: 'completed',
    ERROR: 'error',
  };

  static updateStatus(id, status) {
    return org.objects.int__queue.updateOne(
      { _id: id },
      { $set: { int__status: status } },
    )
      .execute();
  }

  @log({ traceError: true })
  @trigger('create.after', 'update.after', {
    weight: 1,
    object: 'int__queue',
    principal: 'c_system_user',
    if: {
      $and: [
        { $eq: ['$$ROOT.int__status', 'queued'] },
        { $gte: ['$$ROOT.int__retry_count', 0] },
      ],
    },
  })
  static process({ context }) {

    try {
      this.updateStatus(context._id, Queue.STATUS.IN_PROGRESS);

      const queue = org.objects.int__queue.find({ _id: context._id })
        .expand(['int__pipeline'])
        .next();

      const transactionId = Queue.findTransactionByQueue(queue._id);

      new IntPipeline(queue.int__pipeline.int__identifier, queue._id, transactionId)
        .process(queue.int__message);

      this.updateStatus(context._id, Queue.STATUS.COMPLETED);
    } catch (e) {
      logger.error(e);

      this.updateStatus(context._id, Queue.STATUS.ERROR);

      throw (e);
    }
  }

  static findTransactionByQueue(queueId) {
    const transactionLog = org.objects.int__logs.readOne({ int__queue: queueId })
      .throwNotFound(false)
      .execute();

    return transactionLog && transactionLog.int__transaction;
  }

  @job('*/1 * * * *', {
    name: 'queue_errored_jobs',
    principal: 'c_system_user',
  })
  queueErroredJobs() {
    const items = org.objects.int__queue.find({
      int__status: Queue.STATUS.ERROR,
      int__retry_count: {
        $gt: 0,
      },
    });

    for (const item of items) {
      if (Queue.isPreviousQueueFinished(item._id, item.int__sequence, item.int__vendor)) {
        org.objects.int__queue.updateOne(
          {
            _id: item._id,
          },
          {
            $set: {
              int__status: Queue.STATUS.QUEUED,
              int__retry_count: item.int__retry_count - 1,
            },
          },
        )
          .execute();
      }
    }
  }

  static retryErrorQueue(queueId) {
    const queueCursor = org.objects.int__queue.find({
      _id: queueId,
      int__status: Queue.STATUS.ERROR,
      int__retry_count: 0,
    });

    if (queueCursor.hasNext()) {
      const currQueue = queueCursor.next();

      const prevQueues = org.objects.int__queue.find({
        int__status: 'error',
        int__sequence: currQueue.int__sequence,
        int__vendor: currQueue.int__vendor._id,
        int__retry_count: 0,
        _id: { $lte: currQueue._id },
      })
        .paths('_id')
        .sort({ created: 1 })
        .toArray();

      for (const queue of prevQueues) {
        org.objects.int__queue.updateOne(
          {
            _id: queue._id,
          },
          {
            $set: {
              int__status: Queue.STATUS.QUEUED,
              int__retry_count: 5,
            },
          },
        )
          .execute();
      }

      return prevQueues;
    }
  }

  static isPreviousQueueFinished(queueId, messageSequence, vendor) {
    if (!messageSequence) return true;

    const queueArray = org.objects.int__queue.aggregate([
      {
        $match: {
          $and: [
            {
              int__status: { $in: [Queue.STATUS.ERROR, Queue.STATUS.IN_PROGRESS, Queue.STATUS.QUEUED, Queue.STATUS.SCHEDULED] },
            },
            { int__sequence: messageSequence },
            { int__vendor: vendor._id },
            { _id: { $lt: queueId } },
          ],
        },
      },
      {
        $project: {
          int__status: 1,
        },
      },
    ]);
    return !queueArray.hasNext();
  }

  @log({ traceError: true })
  @trigger('create.after', 'update.after', {
    object: 'int__queue',
    weight: 1,
    principal: 'c_system_user',
    if: {
      $and: [
        { $eq: ['$$ROOT.int__status', 'error'] },
        { $eq: ['$$ROOT.int__retry_count', 0] },
      ],
    },
  })
  static notifyFailedQueue(data) {
    const { context } = data;

    IntNotification.sendQueueNotification(context._id);
  }

  static resetQueues(queueIds, resetReason) {
    const queues = org.objects.int__queue.find({
      _id: { $in: queueIds },
      int__status: Queue.STATUS.ERROR,
    })
      .paths('_id', 'int__status', 'int__retry_count')
      .toArray();
    const filteredQueueIds = queues.map(queue => queue._id);

    const updateParams = {
      int__status: Queue.STATUS.QUEUED, int__retry_count: 5, int__reset_reason: resetReason,
    };
    org.objects.int__queue.updateMany({ _id: { $in: filteredQueueIds } }, { $set: updateParams })
      .execute();

    return queues.map(queue => {
      delete queue.object;
      return { ...queue, ...updateParams };
    });
  }

  /**
   * @ignore
   * @swagger
   * /routes/int/v1/queue/reset:
   *   put:
   *     summary: Reset Queue Route
   *     description: Resets the given queues
   *     tags:
   *       - Queue
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               queueIds:
   *                 type: array
   *               resetReason:
   *                 type: string
   *     responses:
   *       200:
   *         description: OK
   *       403:
   *         description: Forbidden
   *       400:
   *         description: Bad Request
   */
   @log({ traceResult: true, traceError: true })
   @route('PUT /int/v1/queue/reset', {
     acl: 'role.administrator',
     apiKey: 'int__platform',
   })
   @as('c_system_user', {
     safe: false,
     principal: { skipAcl: true, grant: 'update' },
   })
  static resetQueue({ body }) {
    const { queueIds, resetReason } = body();

    // throw an error if reset reason is empty
    if (!resetReason || resetReason.trim() === '') {
      faults.throw('integrations.invalidArgument.missingResetReason');
    }

    return this.resetQueues(queueIds, resetReason);
  }

}

module.exports = Queue;