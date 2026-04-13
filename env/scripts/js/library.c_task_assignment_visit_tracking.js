import {
  trigger,
  log
} from 'decorators'

const { c_events } = org.objects
export class TaskAssignmentVisitTracking {

  @trigger('update.before', {
    object: 'c_task_response',
    principal: 'c_system_user',
    weight: 1,
    if: {
      $and: [
        {
          $gte: [{
            $indexOfArray: [
              '$$SCRIPT.arguments.modified',
              'c_completed'
            ]
          }, 0]
        },
        {
          $eq: [
            '$$ROOT.c_completed',
            true
          ]
        },
        {
          $ne: [
            {
              $dbPath: {
                $concat: [
                  'c_task_response.',
                  '$$ROOT._id',
                  '.c_event.c_task_assignment.c_visit'
                ]
              }
            },
            null
          ]
        }
      ]
    }
  })
  static siteVisitOnResponse({ old, new: updatedTR, modified }) {

    if (!old.c_event) {
      return
    }

    const { c_task_assignment: taskAssignment } = c_events.readOne({ _id: old.c_event._id })
      .skipAcl()
      .grant(consts.accessLevels.read)
      .expand('c_task_assignment')
      .execute()

    if (taskAssignment.c_visit) {
      script.context.update('c_visit', taskAssignment.c_visit._id, { grant: consts.accessLevels.update })
    }
  }

}