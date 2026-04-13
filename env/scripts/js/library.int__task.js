/**
 * DO NOT CUSTOMIZE THIS FILE!
 * Upgrading the integrations-platform package version will overwrite any changes.
 */

/**
 * @classdesc Abstract class for Task
 * @class
 */
class Task {

  static STATUS = {
    SUCCESS: 'success',
    ERROR: 'error',
  }

  /**
   * Class constructor
   * @param {Object} context Data passed from IntPipeline
   * @param {Object} event Data passed from task to task
   */
  constructor(context, event) {
    this.context = context;
    this.event = event;
  }

  /**
   * Process each task with a try-catch block to log status by calling _process()
   */
  process() {
    let response;
    let status;

    try {
      response = this._process();
      status = Task.STATUS.SUCCESS;
      return response;
    } catch (e) {
      response = e;
      status = Task.STATUS.ERROR;

      throw (e);
    } finally {
      org.objects.int__log.insertOne({
        int__queue: this.context.int__queue ? this.context.int__queue._id : {},
        int__request: this.event,
        int__response: response,
        int__status: status,
        int__task: this.context.int__task._id,
        int__transaction: this.context.int__transaction,
      })
        .execute();
    }
  }

}

module.exports = Task;