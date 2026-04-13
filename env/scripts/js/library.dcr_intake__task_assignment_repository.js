/**
 * @fileOverview
 * @summary Encapsulates details of working with org.objects.c_task_assignment
 *
 * @author Data Management Squad
 *
 * @example
 * const { TaskAssignmentRepository } = require('dcr_intake__task_assignment_repository')
 */

const { as } = require('decorators'),
      { c_task_assignment } = org.objects,
      { accessLevels } = consts

/**
 * Task Assignment Repository
 *
 * @class TaskAssignmentRepository
 */

class TaskAssignmentRepository {

  /**
   * Find c_task_assignments ids for anchor date template
   * @memberOf TaskAssignmentRepository
   * @param {String} anchorDateTemplateId
   * @return {String[]} ids
   */
  @as('dcr_intake__system_user', { principal: { skipAcl: true, grant: accessLevels.read } })
  static findIdsForAnchorDateTemplate(anchorDateTemplateId) {
    return c_task_assignment.find({
      $or: [
        { 'c_start_date.c_anchor_date_template': anchorDateTemplateId },
        { 'c_end_date.c_anchor_date_template': anchorDateTemplateId }
      ]
    })
      .map(taskAssignment => taskAssignment._id.toString())
  }

}

module.exports = { TaskAssignmentRepository }