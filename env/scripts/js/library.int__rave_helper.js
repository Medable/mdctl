/**
 * This library can be customized for the study specific requirements to determine the visitCode, visitName and eventRepeatKey for the Rave Integration
 * Upgrading the integrations-platform package version will overwrite any changes.
 * Altenative option is to create a similar helper file without changing this one and import it in int__rave_vendor.js file.
 */

/**
 * Specifiy the Task Keys for each constant. Can be customized to add more Task Keys
 * Task Key value can be fetched from c_task.c_key
 */
const SIBL_TASK = '';
const SIW12_TASK = '';
const SIW26_TASK = '';

/**
 * @classdesc Helper methods for Rave Integration
 * @class
 */
class RaveHelper {

  /**
   * This function can be customized to change the visitCode or visitName or eventRepeatKey for any of the task.
   * More tasks can be added using case statement for each task constant
   * In case, default values for visitCode or visitName or eventRepeatKey need to be changed, update the default block with the required values.
   */

  /**
   * This function determines visitCode, eventRepeatKey and visitName for the given Task ID
   * @param {string} taskR Task Response ID
   * @returns {object}
   */
  static calculateVisit(taskR) {

    let visitCode = '', visitName = '', eventRepeatKey = '';
    const task = org.objects.c_task_response.readOne({ _id: taskR })
      .grant('read')
      .expand('c_task')
      .execute();

    switch (task.c_task.c_key) {
      case SIBL_TASK: {
        visitCode = 'SIBL';
        visitName = 'SI V1 (Baseline)';
        eventRepeatKey = 'SI[1]/SIBL[1]';
        break;
      }
      case SIW12_TASK: {
        visitCode = 'SIW12';
        visitName = 'SI V7 (Week 12)';
        eventRepeatKey = 'SI[1]/SIW12[1]';
        break;
      }
      case SIW26_TASK: {
        visitCode = 'SIW26';
        visitName = 'SI V14 (Week 26)';
        eventRepeatKey = 'SI[1]/SIW26[1]';
        break;
      }
      default: {
        visitCode = '';
        visitName = '';
        eventRepeatKey = '';
      }
    }

    return {
      eventId: visitCode,
      eventRepeatKey,
      visitName,
    };
  }

}

module.exports = RaveHelper;