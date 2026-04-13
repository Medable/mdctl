import { trigger, log } from 'decorators'
import faults from 'c_fault_lib'
import cache from 'cache'
import { debug } from 'logger'

const { accessLevels } = consts
class AnchorDateLib {

      @trigger('create.before', 'update.before', {
        object: 'c_anchor_date_template',
        weight: 1,
        if: {
          $ne: [
            {
              $pathTo: ['$$ROOT', 'c_task_completion']
            },
            null
          ]
        }
      })
  static anchorDateTaskUpdateTrigger({ context, modified, event }) {
    if (event === 'update.before') {
      if (modified.includes('c_task_completion')) {
        this.updateTaskUpdateSchedule(context)
      }
    } else {
      this.updateTaskUpdateSchedule(context)
    }
  }

  @log({ traceError: true })
  @trigger('create.before', { object: 'c_public_user', weight: 1 })
      static publicUserBeforeCreate() {

        const {
          c_study: {
            _id: studyId
          }
        } = script.arguments.new

        const { STATIC } = AnchorDate.TEMPLATE_TYPES

        const anchorDate = new AnchorDate({ type: STATIC, studyId })

        const anchorDates = anchorDate.getAnchorDates()

        if (anchorDates.length) {
          script.arguments.new.push('c_set_dates', anchorDates, { grant: consts.accessLevels.update })
        }
      }

  static updateTaskUpdateSchedule(context) {
    const taskobjectId = context.c_task_completion._id || null
    const update = {
      c_updates_schedule: true
    }
    if (taskobjectId) {
      const result = org.objects.c_task.updateOne({ _id: taskobjectId }, { $set: update })
        .skipAcl()
        .grant(accessLevels.update)
        .lean(false)
        .execute()
    }
  }

  static getAnchorDateUpdate(taskResponse) {

    const {
      _id: taskResponseId,
      c_start,
      c_task: { _id: taskId },
      c_public_user: { _id: publicUserId },
      c_study: { _id: studyId },
      c_completed
    } = taskResponse

    if (!c_completed) return

    const { TASK_COMPLETION, DATE_STEP_COMPLETION } = AnchorDate.TEMPLATE_TYPES

    const taskCompletionAnchorDate = new AnchorDate({
      type: TASK_COMPLETION,
      taskResponseId,
      taskId,
      publicUserId,
      studyId,
      taskResponseStartDate: c_start
    })

    const taskCompletionAnchorDates = taskCompletionAnchorDate.getAnchorDates()

    const stepResponses = org.objects
      .c_step_responses
      .find({ c_task_response: taskResponseId, type: { $in: ['c_date', 'c_datetime'] } })
      .paths('c_step', 'c_value')
      .skipAcl()
      .grant('read')
      .toArray()

    const dateStepAnchorDates = stepResponses
      .map(({ c_step: { _id: stepId }, c_value: stepResponseValue }) => new AnchorDate({
        type: DATE_STEP_COMPLETION,
        stepId,
        publicUserId,
        studyId,
        stepResponseValue
      }))
      .map(anchorDate => anchorDate.getAnchorDates())
      .reduce((acc, curr) => acc.concat(curr), [])

    const anchorDates = [...taskCompletionAnchorDates, ...dateStepAnchorDates]

    const updatedAnchorDates = anchorDates.map(v => v.c_template)

    script.fire('c_anchor_dates_did_change', publicUserId, updatedAnchorDates)

    return { $push: { c_set_dates: anchorDates } }
  }

}

class AnchorDate {

  static TEMPLATE_TYPES = {
    MANUAL: 'Manual',
    STATIC: 'Static',
    DATE_STEP_COMPLETION: 'DateStepCompletion',
    TASK_COMPLETION: 'TaskCompletion',
    VISIT_CONFIRMATION: 'VisitConfirmation'
  }

  constructor(config = {
    type: '',
    stepId: '',
    taskId: '',
    stepResponseValue: '',
    taskResponseId: '',
    taskResponseStartDate: '',
    studyId: '',
    visitId: '',
    visitDate: ''
  }) {
    this.config = config
  }

  getAnchorDates() {

    const templates = this.getTemplates()

    if (templates.length === 0) {
      return []
    }

    this.config = { ...this.config, templates }

    return this.getTemplateAndDates()

  }

  // gets the template based on the type
  getTemplates() {
    const { STATIC, DATE_STEP_COMPLETION, TASK_COMPLETION, VISIT_CONFIRMATION } = AnchorDate.TEMPLATE_TYPES
    const { stepId, taskId, type, studyId, visitId } = this.config
    const anchorDateTemplates = (query) => {
      const queryWithStudyId = { ...query, 'c_study._id': studyId }
      return org.objects
        .c_anchor_date_templates
        .find(queryWithStudyId)
        .skipAcl()
        .grant(consts.accessLevels.read)
        .toArray()
    }

    const getters = {
      [STATIC]: () => anchorDateTemplates({ c_type: STATIC }),
      [DATE_STEP_COMPLETION]: () => anchorDateTemplates({ 'c_date_time_step._id': stepId, c_type: DATE_STEP_COMPLETION }),
      [TASK_COMPLETION]: () => anchorDateTemplates({ 'c_task_completion._id': taskId, c_type: TASK_COMPLETION }),
      [VISIT_CONFIRMATION]: () => anchorDateTemplates({ 'c_visit._id': visitId, c_type: VISIT_CONFIRMATION })
    }

    return getters[type]()
  }

  // returns the date based on the  type
  getTemplateAndDates() {
    const { STATIC, DATE_STEP_COMPLETION, TASK_COMPLETION, VISIT_CONFIRMATION } = AnchorDate.TEMPLATE_TYPES
    const { stepResponseValue, taskResponseId, taskResponseStartDate, type, publicUserId, visitDate } = this.config

    let { templates } = this.config

    const getters = {

      [STATIC]: (template) => {
        return {
          c_date: template.c_static_date,
          c_template: template._id
        }
      },

      [DATE_STEP_COMPLETION]: (template) => {
        return {
          c_date: stepResponseValue,
          c_template: template._id
        }
      },

      [VISIT_CONFIRMATION]: (template) => {
        const visitDateTime = this.config.visitDate || new Date().toISOString().substring(0, 10)

        return {
          c_date: visitDateTime,
          c_template: template._id
        }
      },

      [TASK_COMPLETION]: (template) => {

        const getStartDateFromStepResponse = () => {
          const [firstStepResponse] = org.objects
            .c_step_responses
            .find({ 'c_task_response._id': taskResponseId })
            .sort({ created: 1 })
            .skipAcl()
            .grant(consts.accessLevels.read)
            .paths('c_start_date')
            .limit(1)
            .toArray()
          return firstStepResponse.c_start_date
        }

        let anchorDate = taskResponseStartDate || getStartDateFromStepResponse()

        if (publicUserId) {

          const publicUser = org.objects
            .c_public_user
            .find({ _id: publicUserId })
            .paths('c_tz')
            .skipAcl()
            .grant(consts.accessLevels.read)
            .next()

          const tz = publicUser.c_tz

          if (tz) {

            const moment = require('moment.timezone')

            anchorDate = moment(anchorDate)
              .tz(tz)
              .format('YYYY-MM-DD')
          }
        }

        return {
          c_date: anchorDate,
          c_template: template._id
        }
      }
    }

    if (publicUserId) {

      const existingTemplates = this.getPublicUserTemplates()

      // filter templates already applied to this public user
      templates = templates.filter(template => !existingTemplates[template._id])
    }

    return templates
      .map(tpl => getters[type](tpl))
  }

  // returns the existing templates for a PU
  getPublicUserTemplates() {
    const { publicUserId } = this.config

    if (!publicUserId) return {}

    const publicUser = org.objects
      .c_public_user
      .find({ _id: publicUserId })
      .paths('c_set_dates')
      .skipAcl()
      .grant(consts.accessLevels.read)
      .next()

    const existingTemplates = publicUser.c_set_dates
      .reduce((acc, setDate) => {
        return ({ ...acc, [setDate.c_template._id]: true })
      }, {})

    return existingTemplates
  }

}

module.exports = {
  AnchorDateLib,
  AnchorDate
}