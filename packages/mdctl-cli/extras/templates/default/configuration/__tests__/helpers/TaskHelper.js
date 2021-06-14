import moment from 'moment'
const { v4 } = require('uuid')

export class TaskHelper {

  static async createTaskResponse(client, response, waitAfter = true) {
    return await client.post('routes/create_task_response', response, waitAfter)
  }

  static getStepValueForType(type, step) {
    switch (type) {
      case 'boolean': {
        return {
          c_value: true
        }
      }
      case 'text': {
        return {
          c_value: 'could be more random'
        }
      }
      case 'numeric': {

        return {
          c_value: 53.7
        }
      }
      case 'image_capture': {

        return {
          c_value: {
            content: 'image.png'
          }
        }
      }
      case 'completion': {
        return {
          c_value: true
        }
      }
    }

  }

  static getResponseForTask(task, options) {

    const {
      startTime,
      c_group,
      c_study,
      c_site,
      uuid,
      c_public_user,
      c_success = true,
      c_event,
      stepValues = {},
      c_completed = true
    } = options

    const secondsPerStep = 5
    const numSteps = task.c_steps.data.length
    const taskTime = secondsPerStep * numSteps
    const c_start = moment(startTime)
      .subtract((numSteps * secondsPerStep), 'seconds')
      .toISOString()

    const c_task_response = {
      c_task: task._id,
      c_study,
      c_group,
      c_completed,
      c_uuid: uuid || v4(),
      c_success,
      c_public_user,
      c_event,
      c_site,
      c_start,
      c_end: moment(startTime)
        .add(taskTime, 'seconds')
        .toISOString(),
      c_step_responses: task.c_steps.data.map((v, i) => {
        const stepValue = stepValues[v._id] !== undefined ? stepValues[v._id] : this.getStepValueForType(v.c_type)
        return {
          c_step: v._id,
          type: `c_${v.c_type}`,
          c_public_user,
          c_start_date: moment(startTime)
            .add((secondsPerStep * i), 'seconds')
            .toISOString(),
          c_end_date: moment(startTime)
            .add((secondsPerStep * (i + 1)), 'seconds')
            .toISOString(),
          c_task: task._id,
          c_group,
          c_study,
          ...stepValue
        }
      })
    }

    return { c_task_response }

  }

}