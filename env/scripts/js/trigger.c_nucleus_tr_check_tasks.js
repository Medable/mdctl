import logger from 'logger'
import nucUtils from 'c_nucleus_utils'

const screenFailedTaskName = 'Screen Failure'
const completionStatusTaskName = 'Completion Status'

const { c_task_responses, c_public_users, c_tasks } = org.objects

// Changes to task response status may require changes to other task response properties
let status = script.arguments.new.c_status

let tr = c_task_responses
  .find({ _id: script.context._id })
  .skipAcl().grant(consts.accessLevels.read)
  .passive()
  .paths('c_status', 'c_task.c_name', 'c_step_responses.c_step.c_name', 'c_step_responses.c_value', 'c_public_user.c_status')
  .next()

// Checking the resposne is for specific tasks, and if so checking the impact on the public user status
if (tr.c_task.c_name === screenFailedTaskName || tr.c_task.c_name === completionStatusTaskName) {
  if (tr.c_status !== 'Inactive' && tr.c_public_user.c_status === 'Enrolled') { // if the current value is something other that enrolled, no changes get made
    nucUtils.setPublicUserStatusFromTaskResp(tr)
  } else if (tr.c_status === 'Inactive') {
    let taskIds = c_tasks.find({ c_name: { '$in': [screenFailedTaskName, completionStatusTaskName] } }).skipAcl().grant(consts.accessLevels.read).map(v => v._id)

    // This task has been set inactive, so got get the most recent, active task resposne from either of the two tasks we care about
    let taskCursor = c_task_responses
      .find({ c_public_user: tr.c_public_user._id, c_task: { '$in': taskIds }, c_status: { '$in': ['New', 'Incomplete', 'Complete', 'Reviewed'] } })
      .skipAcl().grant(consts.accessLevels.read)
      .passive()
      .paths('c_status', 'c_task.c_name', 'c_step_responses.c_step.c_name', 'c_step_responses.c_value', 'c_public_user.c_status')
      .sort({ created: -1 })

    // eslint-disable-next-line no-mixed-operators
    let foundTask = taskCursor.hasNext() && taskCursor.next() || null

    if (foundTask) { // We do have an active tr that we care about so set the status according to that
      nucUtils.setPublicUserStatusFromTaskResp(foundTask)
    } else if (tr.c_public_user.c_status !== 'Enrolled') {
      script.as(nucUtils.SystemUser.name, {}, () => { return c_public_users.updateOne({ _id: tr.c_public_user._id }, { '$set': { c_status: 'Enrolled' } }).lean(false).execute() })
    }
  }
}